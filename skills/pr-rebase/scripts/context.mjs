#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DIGITS = /^[0-9]+$/;
const PR_URL = /^https:\/\/github\.com\/([A-Za-z0-9._-]{1,39})\/([A-Za-z0-9._-]{1,100})\/pull\/([0-9]+)$/;
const REMOTE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

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

function positiveInteger(raw) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("PR number must be a positive integer");
  return value;
}

export function parseTarget(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || /\s/.test(value)) {
    throw new Error("target must be one PR number or canonical URL");
  }
  if (DIGITS.test(value)) return { target: value, number: positiveInteger(value), repository: null };
  const match = value.match(PR_URL);
  if (!match) throw new Error("target must be one PR number or canonical URL");
  return { target: value, number: positiveInteger(match[3]), repository: `${match[1]}/${match[2]}` };
}

function remoteRepository(url) {
  if (typeof url !== "string") return null;
  const match = url.match(/^(?:https?:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

function headRepository(value) {
  if (typeof value === "string") return value;
  return value?.nameWithOwner ?? null;
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

function gitContext(cwd = process.cwd()) {
  const currentBranch = gitOutput(["branch", "--show-current"], cwd);
  if (!currentBranch) throw new Error("current branch is unresolved");
  const pushRemote = gitOutput(["config", "--get", `branch.${currentBranch}.pushRemote`], cwd, true)
    || gitOutput(["config", "--get", "remote.pushDefault"], cwd, true)
    || gitOutput(["config", "--get", `branch.${currentBranch}.remote`], cwd, true)
    || "origin";
  const pushRemoteUrls = gitOutput(["remote", "get-url", "--push", "--all", "--", pushRemote], cwd)
    .split("\n")
    .filter(Boolean);
  const remotes = gitOutput(["remote"], cwd).split("\n").filter(Boolean)
    .map((name) => ({ name, url: gitOutput(["remote", "get-url", "--", name], cwd, true) }))
    .filter((remote) => remote.url);
  return { currentBranch, pushRemote, pushRemoteUrls, remotes };
}

export function verifyContext(input, context = input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("PR metadata must be an object");
  if (!context || typeof context !== "object" || Array.isArray(context)) throw new Error("git context must be an object");
  const canonical = parseTarget(input.url);
  if (!canonical.repository) throw new Error("resolved URL must be canonical");
  if (input.number != null && input.number !== canonical.number) throw new Error("resolved PR number disagrees with URL");
  if (input.state !== "OPEN") throw new Error("PR must be OPEN");
  const headRepo = headRepository(input.headRepository);
  const head = branchName(input.headRefName, "head");
  const baseRef = branchName(input.baseRefName, "base");
  if (typeof context.currentBranch !== "string" || context.currentBranch !== head) {
    throw new Error("current branch does not match PR head");
  }
  if (!Array.isArray(context.remotes) || context.remotes.length === 0) throw new Error("remotes are required");
  const remotes = context.remotes.map((remote) => {
    if (!remote || typeof remote.name !== "string" || !REMOTE.test(remote.name)) {
      throw new Error("invalid remote name");
    }
    return { ...remote, repository: remoteRepository(remote.url) };
  });
  if (typeof context.pushRemote !== "string" || !REMOTE.test(context.pushRemote)) throw new Error("invalid push remote");
  const push = remotes.find((remote) => remote.name === context.pushRemote);
  const pushUrls = Array.isArray(context.pushRemoteUrls)
    ? context.pushRemoteUrls
    : typeof context.pushRemoteUrl === "string"
      ? [context.pushRemoteUrl]
      : push?.url ? [push.url] : [];
  if (
    !headRepo ||
    !push ||
    pushUrls.length !== 1 ||
    remoteRepository(pushUrls[0])?.toLowerCase() !== headRepo.toLowerCase()
  ) {
    throw new Error("push remote must have exactly one URL matching the PR head repository");
  }
  const baseCandidates = remotes
    .filter((remote) => remote.repository?.toLowerCase() === canonical.repository.toLowerCase())
    .sort((left, right) => {
      const score = (name) => name === "upstream" ? 2 : name === "origin" ? 1 : 0;
      return score(right.name) - score(left.name) || left.name.localeCompare(right.name);
    });
  if (!baseCandidates[0]) throw new Error("no remote matches PR repository");
  return {
    url: input.url,
    number: canonical.number,
    baseRepository: canonical.repository,
    headRepository: headRepo,
    branch: context.currentBranch,
    base: baseRef,
    pushRemote: push.name,
    pushUrl: pushUrls[0],
    baseRemote: baseCandidates[0].name,
  };
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function main() {
  try {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === "target" && args.length === 0) output(parseTarget(readFileSync(0, "utf8")));
    else if (mode === "verify" && args.length === 0) {
      output(verifyContext(JSON.parse(readFileSync(0, "utf8")), gitContext()));
    }
    else throw new Error("usage: context.mjs target < target.txt | verify < context.json");
  } catch (error) {
    process.stderr.write(`context: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
