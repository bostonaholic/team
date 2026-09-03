#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DIGITS = /^[0-9]+$/;
const PR_URL = /^https:\/\/github\.com\/([A-Za-z0-9._-]{1,39})\/([A-Za-z0-9._-]{1,100})\/pull\/([0-9]+)$/;
const REMOTE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const VERDICTS = new Set(["STILL RELEVANT", "ALREADY ADDRESSED", "STALE", "INACCURATE"]);
const WATCH_MODES = new Set(["default", "authorized"]);
const REVIEW_STATES = new Set(["COMMENTED", "APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);

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
const THREAD_QUERY = `query($owner: String!, $repo: String!, $number: Int!, $endCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $endCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id isResolved isOutdated path line startLine
          comments(first: 100) {
            pageInfo { hasNextPage }
            nodes {
              id databaseId author { login } body diffHunk url createdAt
              reactionGroups { content viewerHasReacted }
            }
          }
        }
      }
    }
  }
}`;

const THREAD_COMMENTS_QUERY = `query($id: ID!, $endCursor: String) {
  node(id: $id) {
    ... on PullRequestReviewThread {
      comments(first: 100, after: $endCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id databaseId author { login } body diffHunk url createdAt
          reactionGroups { content viewerHasReacted }
        }
      }
    }
  }
}`;

export function reviewThreadsQuery() {
  return THREAD_QUERY;
}

export function reviewThreadCommentsQuery() {
  return THREAD_COMMENTS_QUERY;
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

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function string(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && !value) || value.includes("\0")) {
    throw new Error(`${label} must be ${allowEmpty ? "a string" : "a non-empty string"}`);
  }
  return value;
}

function timestamp(value, label) {
  string(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return value;
}

function nodeId(value, label) {
  const id = string(value, label);
  if (id.length > 512 || /[\r\n]/.test(id)) throw new Error(`${label} is invalid`);
  return id;
}

function githubUrl(value, label) {
  const url = string(value, label);
  if (!/^https:\/\/github\.com\/[^\s]+$/u.test(url)) {
    throw new Error(`${label} must be a GitHub URL`);
  }
  return url;
}

function reactionList(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const reactions = value.map((reaction, index) => string(reaction, `${label}[${index}]`));
  if (new Set(reactions).size !== reactions.length) {
    throw new Error(`${label} contains duplicate reactions`);
  }
  return reactions;
}

function watchThreads(value) {
  if (!Array.isArray(value)) throw new Error("batch.threads must be an array");
  const threads = value.map((record, index) => {
    const label = `batch.threads[${index}]`;
    const thread = object(record, label);
    return {
      id: nodeId(thread.id, `${label}.id`),
      latestCommentId: nodeId(thread.latestCommentId, `${label}.latestCommentId`),
    };
  });
  for (const field of ["id", "latestCommentId"]) {
    const ids = threads.map((thread) => thread[field]);
    if (new Set(ids).size !== ids.length) {
      throw new Error(`batch.threads contains duplicate ${field} values`);
    }
  }
  return threads;
}

function watchFeedback(record, index) {
  const label = `batch.feedback[${index}]`;
  const item = object(record, label);
  if (item.kind !== "issue-comment" && item.kind !== "review-body") {
    throw new Error(`${label}.kind is invalid`);
  }
  if (item.author !== null) string(item.author, `${label}.author`);
  const shared = {
    kind: item.kind,
    id: nodeId(item.id, `${label}.id`),
    author: item.author,
    body: string(item.body, `${label}.body`, { allowEmpty: true }),
    url: githubUrl(item.url, `${label}.url`),
    ownComment: false,
    viewerReactions: reactionList(item.viewerReactions, `${label}.viewerReactions`),
  };
  if (!shared.body.trim()) throw new Error(`${label}.body must contain feedback`);
  if (item.kind === "issue-comment") {
    return { ...shared, createdAt: timestamp(item.createdAt, `${label}.createdAt`) };
  }
  const state = string(item.state, `${label}.state`);
  if (!REVIEW_STATES.has(state)) throw new Error(`${label}.state is invalid`);
  return { ...shared, submittedAt: timestamp(item.submittedAt, `${label}.submittedAt`), state };
}

export function validateWatchBatch(input) {
  const envelope = object(input, "watch batch");
  if (envelope.schema !== 1 || envelope.source !== "pr-watch-as-author") {
    throw new Error("watch batch schema or source is invalid");
  }
  const target = parseTarget(envelope.target);
  if (!target.repository) throw new Error("watch batch target must be a canonical PR URL");
  if (!WATCH_MODES.has(envelope.mode)) throw new Error("watch batch mode must be default or authorized");
  const batch = object(envelope.batch, "batch");
  const threads = watchThreads(batch.threads);
  if (!Array.isArray(batch.feedback)) throw new Error("batch.feedback must be an array");
  const feedback = batch.feedback.map(watchFeedback);
  const feedbackIds = feedback.map(({ id }) => id);
  if (new Set(feedbackIds).size !== feedbackIds.length) {
    throw new Error("batch.feedback contains duplicate IDs");
  }
  return {
    schema: 1,
    source: "pr-watch-as-author",
    target: target.target,
    number: target.number,
    repository: target.repository,
    mode: envelope.mode,
    authorized: envelope.mode === "authorized",
    batch: { threads, feedback },
  };
}

export function parseInvocation(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value.startsWith("{")) return { source: "direct", ...parseTarget(value), batch: null };
  let input;
  try {
    input = JSON.parse(value);
  } catch {
    throw new Error("internal watch batch must be valid JSON");
  }
  return validateWatchBatch(input);
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
  const headRepo = typeof input.headRepository === "string"
    ? input.headRepository
    : input.headRepository?.nameWithOwner;
  const head = branchName(input.headRefName, "head");
  const baseRef = branchName(input.baseRefName, "base");
  if (context.currentBranch !== head) throw new Error("current branch does not match PR head");
  if (!Array.isArray(context.remotes) || context.remotes.length === 0) throw new Error("remotes are required");
  const remotes = context.remotes.map((remote) => {
    if (!remote || typeof remote.name !== "string" || !REMOTE.test(remote.name)) throw new Error("invalid remote name");
    return { ...remote, repository: remoteRepository(remote.url) };
  });
  const push = remotes.find((remote) => remote.name === context.pushRemote);
  const pushRemoteUrls = Array.isArray(context.pushRemoteUrls)
    ? context.pushRemoteUrls
    : typeof context.pushRemoteUrl === "string"
      ? [context.pushRemoteUrl]
      : push?.url ? [push.url] : [];
  if (
    !headRepo ||
    !push ||
    pushRemoteUrls.length !== 1 ||
    remoteRepository(pushRemoteUrls[0])?.toLowerCase() !== headRepo.toLowerCase()
  ) {
    throw new Error("push remote must have exactly one URL matching the PR head repository");
  }
  if (typeof context.pushRemote !== "string" || !REMOTE.test(context.pushRemote)) throw new Error("invalid push remote");
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
    repository: canonical.repository,
    branch: context.currentBranch,
    base: baseRef,
    pushRemote: context.pushRemote,
    pushUrl: pushRemoteUrls[0],
    baseRemote: base.name,
  };
}

export function decideTriage(input) {
  object(input, "decision input");
  if (!VERDICTS.has(input.verdict)) throw new Error("invalid verdict");
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 100) {
    throw new Error("confidence must be between 0 and 100");
  }
  for (const field of ["authorized", "bounded", "ownComment"]) {
    if (typeof input[field] !== "boolean") throw new Error(`${field} must be boolean`);
  }
  const viewerReactions = reactionList(input.viewerReactions, "viewerReactions");
  if (input.safetyStop !== null && (typeof input.safetyStop !== "string" || !input.safetyStop)) {
    throw new Error("safetyStop must be null or a non-empty string");
  }

  const candidate = input.verdict === "INACCURATE"
    ? "THUMBS_DOWN"
    : input.verdict === "STILL RELEVANT" || input.verdict === "ALREADY ADDRESSED"
      ? "THUMBS_UP"
      : null;
  const reaction = input.ownComment || candidate === null || viewerReactions.includes(candidate)
    ? null
    : candidate;
  const autoApply = input.verdict === "STILL RELEVANT"
    && input.bounded
    && input.safetyStop === null
    && (input.authorized || input.confidence > 90);
  const action = input.safetyStop !== null ? "stop" : autoApply ? "auto-apply" : "present";
  return { action, reaction };
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function main() {
  try {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === "query" && args.length === 0) process.stdout.write(`${reviewThreadsQuery()}\n`);
    else if (mode === "comments-query" && args.length === 0) {
      process.stdout.write(`${reviewThreadCommentsQuery()}\n`);
    }
    else if (mode === "target" && args.length === 0) output(parseTarget(readFileSync(0, "utf8")));
    else if (mode === "invocation" && args.length === 0) output(parseInvocation(readFileSync(0, "utf8")));
    else if (mode === "head" && args.length === 0) {
      output(verifyHead(JSON.parse(readFileSync(0, "utf8")), gitContext()));
    }
    else if (mode === "decision" && args.length === 0) {
      output(decideTriage(JSON.parse(readFileSync(0, "utf8"))));
    } else throw new Error("usage: triage.mjs query|comments-query | target|invocation < input.txt | head|decision < input.json");
  } catch (error) {
    process.stderr.write(`triage: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
