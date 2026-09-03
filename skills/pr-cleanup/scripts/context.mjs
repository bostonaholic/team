#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PR_URL = /^https:\/\/github\.com\/([A-Za-z0-9._-]{1,39})\/([A-Za-z0-9._-]{1,100})\/pull\/([0-9]+)$/;
const REMOTE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const SHA = /^[0-9a-f]{40}$/i;

function positiveInteger(raw) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("PR number must be a positive integer");
  return value;
}

function parseUrl(url) {
  const match = typeof url === "string" ? url.match(PR_URL) : null;
  if (!match) throw new Error("resolved URL must be canonical");
  return { url, repository: `${match[1]}/${match[2]}`, number: positiveInteger(match[3]) };
}

function branchName(value, label) {
  if (
    typeof value !== "string" ||
    !value ||
    !/^[A-Za-z0-9._/-]+$/.test(value) ||
    value.startsWith("-") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("..") ||
    value.includes("//") ||
    value.split("/").some((part) => part.startsWith(".") || part.endsWith(".") || part.endsWith(".lock"))
  ) {
    throw new Error(`${label} branch is invalid`);
  }
  return value;
}

function remoteRepository(url) {
  if (typeof url !== "string") return null;
  const match = url.match(/^(?:https?:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

function headRepository(value) {
  return typeof value === "string" ? value : value?.nameWithOwner ?? null;
}

function gitOutput(args, cwd, optional = false) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", optional ? "ignore" : "pipe"],
    }).trim();
  } catch (error) {
    if (optional) return "";
    throw error;
  }
}

function gitContext(headRefName, cwd = process.cwd()) {
  const head = branchName(headRefName, "head");
  const commonDir = gitOutput(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd);
  const primaryRoot = dirname(commonDir);
  const primaryGitDir = gitOutput(["-C", primaryRoot, "rev-parse", "--path-format=absolute", "--git-dir"], cwd);
  const primaryCommonDir = gitOutput(["-C", primaryRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd);
  const firstWorktree = gitOutput(["-C", primaryRoot, "worktree", "list", "--porcelain"], cwd)
    .split("\n")[0]?.replace(/^worktree /, "");
  const topLevel = gitOutput(["-C", primaryRoot, "rev-parse", "--show-toplevel"], cwd);
  if (primaryGitDir !== commonDir || primaryCommonDir !== commonDir || firstWorktree !== primaryRoot || topLevel !== primaryRoot) {
    throw new Error("primary clone validation failed");
  }

  const currentBranch = gitOutput(["branch", "--show-current"], cwd, true) || null;
  if (currentBranch) branchName(currentBranch, "current");
  const pushRemote = gitOutput(["-C", primaryRoot, "config", "--get", `branch.${head}.pushRemote`], cwd, true)
    || gitOutput(["-C", primaryRoot, "config", "--get", "remote.pushDefault"], cwd, true)
    || gitOutput(["-C", primaryRoot, "config", "--get", `branch.${head}.remote`], cwd, true)
    || "origin";
  const pushRemoteUrls = gitOutput(["-C", primaryRoot, "remote", "get-url", "--push", "--all", "--", pushRemote], cwd)
    .split("\n")
    .filter(Boolean);
  const remotes = gitOutput(["-C", primaryRoot, "remote"], cwd).split("\n").filter(Boolean)
    .map((name) => ({ name, url: gitOutput(["-C", primaryRoot, "remote", "get-url", "--", name], cwd, true) }))
    .filter((remote) => remote.url);
  return { primaryRoot, currentBranch, pushRemote, pushRemoteUrls, remotes };
}

export function verifyContext(input, context = input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("cleanup input must be an object");
  if (!input.request || typeof input.request !== "object" || Array.isArray(input.request)) throw new Error("request is required");
  if (!input.pr || typeof input.pr !== "object" || Array.isArray(input.pr)) throw new Error("PR metadata is required");
  if (!context || typeof context !== "object" || Array.isArray(context)) throw new Error("git context must be an object");

  const { request, pr } = input;
  if (request.mode !== "merged" && request.mode !== "abandon") throw new Error("mode must be merged or abandon");
  const canonical = parseUrl(pr.url);
  if (positiveInteger(request.number) !== canonical.number || (pr.number != null && pr.number !== canonical.number)) {
    throw new Error("resolved PR number disagrees with request");
  }
  if (request.repository && request.repository.toLowerCase() !== canonical.repository.toLowerCase()) {
    throw new Error("resolved PR repository disagrees with request");
  }
  if (request.mode === "merged" && pr.state !== "MERGED") throw new Error("merged cleanup requires a MERGED PR");
  if (request.mode === "abandon" && pr.state !== "OPEN" && pr.state !== "CLOSED") {
    throw new Error("abandon cleanup requires an OPEN or CLOSED PR");
  }

  const branch = branchName(pr.headRefName, "head");
  const base = branchName(pr.baseRefName, "base");
  const headRepo = headRepository(pr.headRepository);
  if (!headRepo || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(headRepo)) {
    throw new Error("head repository is invalid");
  }
  if (!Array.isArray(context.remotes) || context.remotes.length === 0) throw new Error("remotes are required");
  const remotes = context.remotes.map((remote) => {
    if (!remote || typeof remote.name !== "string" || !REMOTE.test(remote.name)) throw new Error("invalid remote name");
    return { ...remote, repository: remoteRepository(remote.url) };
  });
  if (typeof context.pushRemote !== "string" || !REMOTE.test(context.pushRemote)) throw new Error("invalid push remote");
  const push = remotes.find((remote) => remote.name === context.pushRemote);
  const pushUrls = Array.isArray(context.pushRemoteUrls)
    ? context.pushRemoteUrls
    : typeof context.pushRemoteUrl === "string"
      ? [context.pushRemoteUrl]
      : push?.url ? [push.url] : [];
  if (!push || pushUrls.length !== 1 || remoteRepository(pushUrls[0])?.toLowerCase() !== headRepo.toLowerCase()) {
    throw new Error("push remote must have exactly one URL matching the PR head repository");
  }
  const baseRemote = remotes
    .filter((remote) => remote.repository?.toLowerCase() === canonical.repository.toLowerCase())
    .sort((left, right) => {
      const score = (name) => name === "upstream" ? 2 : name === "origin" ? 1 : 0;
      return score(right.name) - score(left.name) || left.name.localeCompare(right.name);
    })[0];
  if (!baseRemote) throw new Error("no remote matches PR repository");
  if (typeof context.primaryRoot !== "string" || !context.primaryRoot) throw new Error("primary root is required");
  if (context.currentBranch !== null && context.currentBranch !== undefined) branchName(context.currentBranch, "current");

  const headOid = pr.headRefOid ?? null;
  const mergeOid = pr.mergeCommit?.oid ?? null;
  if (headOid !== null && !SHA.test(headOid)) throw new Error("head OID is invalid");
  if (request.mode === "merged" && (!headOid || !mergeOid || !SHA.test(mergeOid))) {
    throw new Error("merged cleanup requires valid head and merge OIDs");
  }

  return {
    mode: request.mode,
    url: canonical.url,
    number: canonical.number,
    state: pr.state,
    closeNeeded: request.mode === "abandon" && pr.state === "OPEN",
    baseRepository: canonical.repository,
    headRepository: headRepo,
    branch,
    base,
    headOid,
    mergeOid,
    primaryRoot: context.primaryRoot,
    currentBranch: context.currentBranch ?? null,
    pushRemote: push.name,
    pushUrl: pushUrls[0],
    baseRemote: baseRemote.name,
  };
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function main() {
  try {
    const [mode, ...args] = process.argv.slice(2);
    if (mode !== "verify" || args.length !== 0) throw new Error("usage: context.mjs verify < input.json");
    const input = JSON.parse(readFileSync(0, "utf8"));
    output(verifyContext(input, gitContext(input?.pr?.headRefName)));
  } catch (error) {
    process.stderr.write(`cleanup-context: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
