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

export function verifyHead(input, context = input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("head input must be an object");
  if (!context || typeof context !== "object" || Array.isArray(context)) throw new Error("git context must be an object");
  const canonical = parseTarget(input.url);
  if (!canonical.repository) throw new Error("resolved URL must be canonical");
  if (input.number != null && input.number !== canonical.number) throw new Error("resolved PR number disagrees with URL");
  if (input.state !== "OPEN") throw new Error("PR must be OPEN");
  const headRepo = typeof input.headRepository === "string" ? input.headRepository : input.headRepository?.nameWithOwner;
  const head = branchName(input.headRefName, "head");
  const baseRef = branchName(input.baseRefName, "base");
  if (context.currentBranch !== head) throw new Error("current branch does not match PR head");
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
  if (
    !headRepo ||
    !push ||
    pushUrls.length !== 1 ||
    remoteRepository(pushUrls[0])?.toLowerCase() !== headRepo.toLowerCase()
  ) {
    throw new Error("push remote must have exactly one URL matching the PR head repository");
  }
  const base = remotes
    .filter((remote) => remote.repository?.toLowerCase() === canonical.repository.toLowerCase())
    .sort((left, right) => {
      const score = (name) => name === "upstream" ? 2 : name === "origin" ? 1 : 0;
      return score(right.name) - score(left.name) || left.name.localeCompare(right.name);
    })[0];
  if (!base) throw new Error("no remote matches PR repository");
  return {
    url: input.url,
    number: canonical.number,
    baseRepository: canonical.repository,
    headRepository: headRepo,
    branch: context.currentBranch,
    base: baseRef,
    pushRemote: push.name,
    pushUrl: pushUrls[0],
    baseRemote: base.name,
  };
}

export function evaluateSettlement(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("settlement input must be an object");
  }
  if (!Number.isInteger(input.attempt) || input.attempt < 1 || input.attempt > 6) {
    throw new Error("attempt must be an integer from 1 through 6");
  }
  if (typeof input.mergeStateStatus !== "string" || typeof input.checksComplete !== "boolean") {
    throw new Error("mergeStateStatus and checksComplete are required");
  }
  if (!Number.isInteger(input.checkCount) || input.checkCount < 0) {
    throw new Error("checkCount must be a non-negative integer");
  }
  if (!Number.isInteger(input.zeroCheckReads) || input.zeroCheckReads < 0 || input.zeroCheckReads >= input.attempt) {
    throw new Error("zeroCheckReads must count prior zero-check reads");
  }
  const zeroCheckReads = input.zeroCheckReads + (input.checkCount === 0 ? 1 : 0);
  const settled = input.mergeStateStatus !== "UNKNOWN" && input.checksComplete && input.checkCount > 0;
  return {
    settled,
    exhausted: !settled && input.attempt === 6,
    nextAttempt: !settled && input.attempt < 6 ? input.attempt + 1 : null,
    zeroCheckReads,
    skipCheckWatch: !settled && input.attempt === 6 && zeroCheckReads === 6,
  };
}

export function evaluateMergeability(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("mergeability input must be an object");
  }
  if (typeof input.state !== "string") throw new Error("state is required");
  for (const field of ["behindRebases", "unstableRetries", "unknownRetries"]) {
    if (!Number.isInteger(input[field]) || input[field] < 0 || input[field] > 1) {
      throw new Error(`${field} must be 0 or 1`);
    }
  }
  if (input.state === "CLEAN" || input.state === "HAS_HOOKS") return { action: "merge" };
  if (input.state === "BEHIND" && input.behindRebases === 0) return { action: "rebase" };
  if (input.state === "UNSTABLE" && input.unstableRetries === 0) return { action: "retry-ci" };
  if (input.state === "UNKNOWN" && input.unknownRetries === 0) return { action: "reread" };
  return { action: "stop" };
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function main() {
  try {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === "target" && args.length === 0) output(parseTarget(readFileSync(0, "utf8")));
    else if (mode === "head" && args.length === 0) {
      output(verifyHead(JSON.parse(readFileSync(0, "utf8")), gitContext()));
    }
    else if (mode === "settle" && args.length === 0) {
      output(evaluateSettlement(JSON.parse(readFileSync(0, "utf8"))));
    } else if (mode === "mergeability" && args.length === 0) {
      output(evaluateMergeability(JSON.parse(readFileSync(0, "utf8"))));
    } else throw new Error("usage: merge-state.mjs target < target.txt | head|settle|mergeability < input.json");
  } catch (error) {
    process.stderr.write(`merge-state: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
