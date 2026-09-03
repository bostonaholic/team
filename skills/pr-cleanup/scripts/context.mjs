#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DIGITS = /^[0-9]+$/;
const PR_URL = /^https:\/\/github\.com\/([A-Za-z0-9._-]{1,39})\/([A-Za-z0-9._-]{1,100})\/pull\/([0-9]+)$/;
const BRANCH = /^[A-Za-z0-9._/-]+$/;
const REPOSITORY = /^[A-Za-z0-9._-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const REMOTE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function positiveInteger(raw) {
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("PR number must be a positive integer");
  return number;
}

function validBranch(value) {
  if (!BRANCH.test(value) || value.startsWith("-") || value.includes("..")) return false;
  try {
    execFileSync("git", ["check-ref-format", "--branch", value], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function parseTarget(raw) {
  if (raw === "") {
    return { kind: "current", target: null, number: null, repository: null, branch: null };
  }
  if (typeof raw !== "string" || raw.trim() !== raw || /\s/.test(raw)) {
    throw new Error("target must be empty, one PR number, canonical URL, or branch");
  }
  if (DIGITS.test(raw)) {
    return { kind: "pr", target: raw, number: positiveInteger(raw), repository: null, branch: null };
  }
  const url = raw.match(PR_URL);
  if (url) {
    return {
      kind: "pr",
      target: raw,
      number: positiveInteger(url[3]),
      repository: `${url[1]}/${url[2]}`,
      branch: null,
    };
  }
  if (!validBranch(raw)) throw new Error("target must be empty, one PR number, canonical URL, or branch");
  return { kind: "branch", target: raw, number: null, repository: null, branch: raw };
}

export function parseRemoteRepository(raw) {
  if (typeof raw !== "string") return null;
  const match = raw.match(/^(?:https?:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

function canonicalPr(url) {
  const match = typeof url === "string" ? url.match(PR_URL) : null;
  if (!match) throw new Error("resolved PR URL is not canonical");
  return { owner: match[1], repo: match[2], number: positiveInteger(match[3]) };
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
  const parsed = urls.map(parseRemoteRepository);
  if (parsed.some((repository) => repository === null)) {
    throw new Error("push remote contains an unrecognized repository identity");
  }
  const repositories = new Set(parsed.map((repository) => repository.toLowerCase()));
  if (repositories.size !== 1) throw new Error("push remote contains multiple repository identities");
  const repository = parsed[0];
  if (repository.toLowerCase() !== expectedRepository.toLowerCase()) {
    throw new Error("push remote does not match PR head repository");
  }
  return { pushUrl: urls[0], repository };
}

function checkedSelector(selector) {
  if (!selector || typeof selector !== "object" || Array.isArray(selector)) {
    throw new Error("selector must be an object");
  }
  const reparsed = parseTarget(selector.target ?? "");
  for (const field of ["kind", "target", "number", "repository", "branch"]) {
    if (reparsed[field] !== selector[field]) throw new Error("selector is inconsistent");
  }
  return reparsed;
}

export function verifyContext(input, context) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("binding input must be an object");
  }
  const selector = checkedSelector(input.selector);
  const metadata = input.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("PR metadata must be an object");
  }
  if (input.mode !== "merged" && input.mode !== "abandon") throw new Error("invalid cleanup mode");
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    throw new Error("git context must be an object");
  }
  const canonical = canonicalPr(metadata.url);
  const baseRepository = `${canonical.owner}/${canonical.repo}`;
  if (metadata.number != null && metadata.number !== canonical.number) {
    throw new Error("resolved PR number disagrees with URL");
  }
  if (selector.number != null && selector.number !== canonical.number) {
    throw new Error("target PR number disagrees with resolved PR");
  }
  if (selector.repository && selector.repository.toLowerCase() !== baseRepository.toLowerCase()) {
    throw new Error("target repository disagrees with resolved PR");
  }
  if (typeof metadata.headRefName !== "string" || !validBranch(metadata.headRefName)) {
    throw new Error("resolved head branch is invalid");
  }
  if (typeof metadata.baseRefName !== "string" || !validBranch(metadata.baseRefName)) {
    throw new Error("resolved base branch is invalid");
  }
  if (selector.kind === "branch" && selector.branch !== metadata.headRefName) {
    throw new Error("target branch disagrees with resolved PR head");
  }
  if (selector.kind === "current" && context.currentBranch !== metadata.headRefName) {
    throw new Error("invoking branch does not match resolved PR head");
  }
  if (input.mode === "merged") {
    if (
      metadata.state !== "MERGED"
      || !metadata.mergedAt
      || typeof metadata.headRefOid !== "string"
      || !OID.test(metadata.headRefOid)
      || typeof metadata.mergeCommit?.oid !== "string"
      || !OID.test(metadata.mergeCommit.oid)
    ) {
      throw new Error("merged cleanup requires complete merged PR metadata");
    }
  } else if (metadata.state !== "OPEN" && metadata.state !== "CLOSED") {
    throw new Error("abandon cleanup requires an open or closed PR");
  }
  if (typeof context.pushRemote !== "string" || !REMOTE.test(context.pushRemote)) {
    throw new Error("invalid push remote");
  }
  const head = headRepository(metadata);
  const push = pushIdentity(context.pushRemoteUrls, head);
  const remotes = Array.isArray(context.remotes) ? context.remotes : [];
  for (const remote of remotes) {
    if (!remote || typeof remote.name !== "string" || !REMOTE.test(remote.name) || !Array.isArray(remote.urls)) {
      throw new Error("invalid remote context");
    }
  }
  if (!remotes.some((remote) => remote.name === context.pushRemote)) {
    throw new Error("configured push remote is missing");
  }
  const baseCandidates = remotes
    .filter((remote) => parseRemoteRepository(remote.urls[0])?.toLowerCase() === baseRepository.toLowerCase())
    .sort((left, right) => {
      const score = (name) => name === "upstream" ? 2 : name === "origin" ? 1 : 0;
      return score(right.name) - score(left.name) || left.name.localeCompare(right.name);
    });
  if (!baseCandidates[0]) throw new Error("no fetch remote matches PR base repository");
  return {
    canonicalUrl: metadata.url,
    owner: canonical.owner,
    repo: canonical.repo,
    number: canonical.number,
    state: metadata.state,
    branch: metadata.headRefName,
    base: metadata.baseRefName,
    baseRepository,
    headRepository: head,
    headOid: metadata.headRefOid ?? null,
    mergeOid: metadata.mergeCommit?.oid ?? null,
    pushRemote: context.pushRemote,
    pushUrl: push.pushUrl,
    baseRemote: baseCandidates[0].name,
    shouldClose: input.mode === "abandon" && metadata.state === "OPEN",
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
  if (parseRemoteRepository(input.pushUrl)?.toLowerCase() !== input.pushRepository.toLowerCase()) {
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

function gitContext(branch, cwd = process.cwd()) {
  const currentBranch = gitOutput(["branch", "--show-current"], cwd, true);
  const pushRemote = gitOutput(["config", "--get", `branch.${branch}.pushRemote`], cwd, true)
    || gitOutput(["config", "--get", "remote.pushDefault"], cwd, true)
    || gitOutput(["config", "--get", `branch.${branch}.remote`], cwd, true)
    || "origin";
  const pushRemoteUrls = gitOutput(["remote", "get-url", "--push", "--all", "--", pushRemote], cwd)
    .split("\n")
    .filter(Boolean);
  const remotes = gitOutput(["remote"], cwd).split("\n").filter(Boolean).map((name) => ({
    name,
    urls: gitOutput(["remote", "get-url", "--all", "--", name], cwd, true).split("\n").filter(Boolean),
  })).filter((remote) => remote.urls.length > 0);
  return { currentBranch, pushRemote, pushRemoteUrls, remotes };
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function main() {
  try {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === "target" && args.length === 0) output(parseTarget(readFileSync(0, "utf8")));
    else if (mode === "bind" && args.length === 0) {
      const input = JSON.parse(readFileSync(0, "utf8"));
      output(verifyContext(input, gitContext(input?.metadata?.headRefName)));
    } else if (mode === "remote-head" && args.length === 0) {
      output(captureRemoteHead(JSON.parse(readFileSync(0, "utf8"))));
    } else throw new Error("usage: context.mjs target|bind|remote-head < stdin");
  } catch (error) {
    process.stderr.write(`context: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
