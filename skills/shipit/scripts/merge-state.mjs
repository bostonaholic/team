#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DIGITS = /^[0-9]+$/;
const PR_URL = /^https:\/\/github\.com\/([A-Za-z0-9._-]{1,39})\/([A-Za-z0-9._-]{1,100})\/pull\/([0-9]+)$/;
const REPOSITORY = /^([A-Za-z0-9._-]{1,39})\/([A-Za-z0-9._-]{1,100})$/;
const BRANCH = /^[A-Za-z0-9._/-]+$/;
const REMOTE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export function parseTarget(raw) {
  if (raw === "") return { target: null, number: null };
  if (typeof raw !== "string" || raw.trim() !== raw || !DIGITS.test(raw)) {
    throw new Error("target must be empty or one PR number");
  }
  return { target: raw, number: positiveInteger(raw) };
}

export function parsePushRepository(raw) {
  if (typeof raw !== "string" || !raw) throw new Error("push URL is required");
  let path;
  const https = /^https:\/\/github\.com\/([^/]+\/[^/]+)$/.exec(raw);
  const ssh = /^ssh:\/\/git@github\.com\/([^/]+\/[^/]+)$/.exec(raw);
  const scp = /^git@github\.com:([^/]+\/[^/]+)$/.exec(raw);
  if (https || ssh || scp) path = (https || ssh || scp)[1].replace(/\.git$/, "");
  if (!path || !REPOSITORY.test(path)) throw new Error("push URL is not a canonical GitHub repository");
  return path;
}

function canonicalPr(url) {
  const match = typeof url === "string" ? url.match(PR_URL) : null;
  if (!match) throw new Error("resolved PR URL is not canonical");
  return { owner: match[1], repo: match[2], number: positiveInteger(match[3]) };
}

function positiveInteger(raw) {
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("PR number must be a positive integer");
  return number;
}

function validBranch(value) {
  if (typeof value !== "string" || !BRANCH.test(value) || value.startsWith("-") || value.includes("..")) {
    return false;
  }
  try {
    execFileSync("git", ["check-ref-format", "--branch", value], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function headRepository(metadata) {
  const named = metadata.headRepository?.nameWithOwner;
  const composed = metadata.headRepositoryOwner?.login && metadata.headRepository?.name
    ? `${metadata.headRepositoryOwner.login}/${metadata.headRepository.name}`
    : null;
  if (named && composed && named.toLowerCase() !== composed.toLowerCase()) {
    throw new Error("resolved head repository fields disagree");
  }
  const repository = named || composed;
  if (typeof repository !== "string" || !REPOSITORY.test(repository)) {
    throw new Error("resolved head repository is missing");
  }
  return repository;
}

function pushIdentity(urls, expectedRepository) {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error("push remote URL is unresolved");
  }
  const repositories = urls.map(parsePushRepository);
  const identities = new Set(repositories.map((repository) => repository.toLowerCase()));
  if (identities.size !== 1) throw new Error("push remote contains multiple repository identities");
  if (repositories[0].toLowerCase() !== expectedRepository.toLowerCase()) {
    throw new Error("push remote does not match resolved PR head repository");
  }
  return { pushUrl: urls[0], repository: repositories[0] };
}

export function validateBinding(metadata, context) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("resolved PR metadata must be an object");
  }
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    throw new Error("git context must be an object");
  }
  const canonical = canonicalPr(metadata.url);
  if (metadata.state !== "OPEN") throw new Error("resolved PR must be open");
  if (!validBranch(metadata.baseRefName)) {
    throw new Error("resolved base branch is invalid");
  }
  if (metadata.number != null && metadata.number !== canonical.number) {
    throw new Error("resolved PR number disagrees with canonical URL");
  }
  if (!validBranch(metadata.headRefName)) {
    throw new Error("resolved head branch is invalid");
  }
  if (typeof metadata.headRefOid !== "string" || !OID.test(metadata.headRefOid)) {
    throw new Error("resolved PR head OID is invalid");
  }
  if (context.currentBranch !== metadata.headRefName) {
    throw new Error("current branch does not match resolved PR head");
  }
  if (typeof context.pushRemote !== "string" || !REMOTE.test(context.pushRemote)) {
    throw new Error("push remote is invalid");
  }
  const head = headRepository(metadata);
  const push = pushIdentity(context.pushRemoteUrls, head);
  const base = `${canonical.owner}/${canonical.repo}`.toLowerCase();
  const remoteUrls = context.remoteUrls && typeof context.remoteUrls === "object"
    ? context.remoteUrls
    : {};
  let baseRemote = null;
  for (const remote of Object.keys(remoteUrls).sort()) {
    if (!REMOTE.test(remote) || !Array.isArray(remoteUrls[remote])) {
      throw new Error("remote context is invalid");
    }
    if (baseRemote) break;
    const urls = Array.isArray(remoteUrls[remote]) ? remoteUrls[remote] : [];
    if (urls.some((url) => {
      try {
        return parsePushRepository(url).toLowerCase() === base;
      } catch {
        return false;
      }
    })) baseRemote = remote;
  }
  return {
    ...metadata,
    canonicalUrl: metadata.url,
    owner: canonical.owner,
    repo: canonical.repo,
    number: canonical.number,
    headRepository: head,
    headOid: metadata.headRefOid,
    branch: context.currentBranch,
    base: metadata.baseRefName,
    currentBranch: context.currentBranch,
    pushRemote: context.pushRemote,
    pushUrl: push.pushUrl,
    pushRemoteUrls: context.pushRemoteUrls,
    baseRemote,
  };
}

export function parseRemoteHead(output, branch) {
  if (!validBranch(branch)) throw new Error("remote-head branch is invalid");
  if (typeof output !== "string") throw new Error("remote-head output must be text");
  const lines = output.trim() ? output.trim().split("\n") : [];
  if (lines.length === 0) return null;
  if (lines.length !== 1) throw new Error("remote-head query returned multiple refs");
  const [oid, ref, ...extra] = lines[0].split("\t");
  if (extra.length > 0 || !OID.test(oid) || ref !== `refs/heads/${branch}`) {
    throw new Error("remote-head query returned invalid data");
  }
  return oid;
}

export function captureRemoteHead(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("remote-head input must be an object");
  }
  if (typeof input.pushRepository !== "string" || !REPOSITORY.test(input.pushRepository)) {
    throw new Error("remote-head repository is invalid");
  }
  if (parsePushRepository(input.pushUrl).toLowerCase() !== input.pushRepository.toLowerCase()) {
    throw new Error("remote-head URL does not match its repository");
  }
  if (!validBranch(input.branch)) throw new Error("remote-head branch is invalid");
  const result = execFileSync(
    "git",
    ["ls-remote", "--heads", "--", input.pushUrl, `refs/heads/${input.branch}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return { remoteSha: parseRemoteHead(result, input.branch) };
}

export function validateRebasePreflight(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("rebase preflight input must be an object");
  }
  const binding = input.binding;
  const metadata = input.metadata;
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
    throw new Error("rebase binding must be an object");
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("fresh PR metadata must be an object");
  }
  const boundCanonical = canonicalPr(binding.canonicalUrl);
  const freshCanonical = canonicalPr(metadata.url);
  if (
    boundCanonical.owner.toLowerCase() !== freshCanonical.owner.toLowerCase()
    || boundCanonical.repo.toLowerCase() !== freshCanonical.repo.toLowerCase()
    || boundCanonical.number !== freshCanonical.number
  ) {
    throw new Error("fresh PR identity changed");
  }
  if (metadata.state !== "OPEN") throw new Error("PR is no longer open");
  if (metadata.mergeStateStatus !== "BEHIND") throw new Error("PR is no longer behind");
  if (!validBranch(binding.branch) || metadata.headRefName !== binding.branch) {
    throw new Error("fresh PR head branch changed");
  }
  if (!validBranch(binding.base) || metadata.baseRefName !== binding.base) {
    throw new Error("fresh PR base branch changed");
  }
  if (typeof binding.headRepository !== "string" || !REPOSITORY.test(binding.headRepository)) {
    throw new Error("bound head repository is invalid");
  }
  if (headRepository(metadata).toLowerCase() !== binding.headRepository.toLowerCase()) {
    throw new Error("fresh PR head repository changed");
  }
  if (parsePushRepository(binding.pushUrl).toLowerCase() !== binding.headRepository.toLowerCase()) {
    throw new Error("bound push URL changed identity");
  }
  for (const [label, oid] of [
    ["fresh PR head", metadata.headRefOid],
    ["local head", input.localHead],
    ["remote head", input.remoteSha],
  ]) {
    if (typeof oid !== "string" || !OID.test(oid)) throw new Error(`${label} OID is invalid`);
  }
  if (metadata.headRefOid !== input.localHead || metadata.headRefOid !== input.remoteSha) {
    throw new Error("PR, local, and push-remote heads disagree");
  }
  return { remoteShaBefore: input.remoteSha, headOid: metadata.headRefOid };
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
  const remoteUrls = {};
  for (const remote of gitOutput(["remote"], cwd).split("\n").filter(Boolean)) {
    remoteUrls[remote] = gitOutput(["remote", "get-url", "--all", "--", remote], cwd)
      .split("\n")
      .filter(Boolean);
  }
  return { currentBranch, pushRemote, pushRemoteUrls, remoteUrls };
}

export function evaluateSettlement(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("settlement input must be an object");
  }
  if (!Number.isInteger(input.attempt) || input.attempt < 1 || input.attempt > 6) {
    throw new Error("attempt must be an integer from 1 through 6");
  }
  if (typeof input.mergeStateStatus !== "string") throw new Error("mergeStateStatus is required");
  if (!Number.isSafeInteger(input.checkCount) || input.checkCount < 0) {
    throw new Error("checkCount must be a non-negative integer");
  }
  const stateKnown = input.mergeStateStatus !== "UNKNOWN";
  const settled = stateKnown && input.checkCount > 0;
  const terminal = input.attempt === 6;
  return {
    settled,
    exhausted: !settled && terminal,
    action: settled ? "watch" : terminal && stateKnown ? "skip-checks" : terminal ? "stop" : "wait",
    nextAttempt: !settled && !terminal ? input.attempt + 1 : null,
  };
}

export function evaluateMergeability(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("mergeability input must be an object");
  }
  if (typeof input.state !== "string") throw new Error("state is required");
  for (const field of ["unstableRetries", "unknownRetries", "behindRebases"]) {
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
    else if (mode === "bind" && args.length === 0) {
      output(validateBinding(JSON.parse(readFileSync(0, "utf8")), gitContext()));
    } else if (mode === "remote-head" && args.length === 0) {
      output(captureRemoteHead(JSON.parse(readFileSync(0, "utf8"))));
    } else if (mode === "rebase-preflight" && args.length === 0) {
      output(validateRebasePreflight(JSON.parse(readFileSync(0, "utf8"))));
    } else if (mode === "settle" && args.length === 0) {
      output(evaluateSettlement(JSON.parse(readFileSync(0, "utf8"))));
    } else if (mode === "mergeability" && args.length === 0) {
      output(evaluateMergeability(JSON.parse(readFileSync(0, "utf8"))));
    } else throw new Error("usage: merge-state.mjs target|bind|remote-head|rebase-preflight|settle|mergeability < stdin");
  } catch (error) {
    process.stderr.write(`merge-state: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
