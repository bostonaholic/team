#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DIGITS = /^[0-9]+$/;
const PR_URL = /^https:\/\/github\.com\/([A-Za-z0-9._-]{1,39})\/([A-Za-z0-9._-]{1,100})\/pull\/([0-9]+)$/;
const REMOTE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const STATES = new Set(["OPEN", "MERGED", "CLOSED"]);
const DECISIONS = new Set(["APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED", null]);
const WATCH_MODES = new Set(["default", "authorized"]);
const REVIEW_STATES = new Set(["PENDING", "COMMENTED", "APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);

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
const POLL_QUERY = `query(
  $owner: String!
  $repo: String!
  $number: Int!
  $threadsAfter: String
  $commentsAfter: String
  $reviewsAfter: String
) {
  viewer { login }
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $threadsAfter) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id isResolved
          comments(first: 100) {
            pageInfo { hasNextPage endCursor }
            nodes { id author { login } }
          }
        }
      }
      comments(first: 100, after: $commentsAfter) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id author { login } body createdAt url
          reactionGroups { content viewerHasReacted }
        }
      }
      reviews(
        first: 100
        after: $reviewsAfter
        states: [COMMENTED, APPROVED, CHANGES_REQUESTED, DISMISSED]
      ) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id submittedAt state body url author { login }
          reactionGroups { content viewerHasReacted }
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
        nodes { id author { login } }
      }
    }
  }
}`;

export function pollQuery() {
  return POLL_QUERY;
}

export function threadCommentsQuery() {
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

function identityState(value, label) {
  const state = object(value, label);
  const result = {};
  for (const key of ["threadIds", "threadCommentIds", "issueCommentIds", "reviewIds"]) {
    if (!Array.isArray(state[key])) throw new Error(`${label}.${key} must be an array`);
    const ids = state[key].map((id, index) => nodeId(id, `${label}.${key}[${index}]`));
    if (new Set(ids).size !== ids.length) throw new Error(`${label}.${key} contains duplicate IDs`);
    result[key] = ids;
  }
  return result;
}

function githubUrl(value, label) {
  const url = string(value, label);
  if (!/^https:\/\/github\.com\/[^\s]+$/u.test(url)) {
    throw new Error(`${label} must be a GitHub URL`);
  }
  return url;
}

function authorLogin(value, label) {
  if (value === null) return null;
  const author = object(value, label);
  return author.login === null ? null : string(author.login, `${label}.login`);
}

function viewerReactions(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const reactions = [];
  for (const [index, group] of value.entries()) {
    object(group, `${label}[${index}]`);
    const content = string(group.content, `${label}[${index}].content`);
    if (typeof group.viewerHasReacted !== "boolean") {
      throw new Error(`${label}[${index}].viewerHasReacted must be boolean`);
    }
    if (group.viewerHasReacted && !reactions.includes(content)) reactions.push(content);
  }
  return reactions;
}

function dedupe(records, label, normalize) {
  const seen = new Map();
  for (const [index, record] of records.entries()) {
    const normalized = normalize(record, `${label}[${index}]`);
    const previous = seen.get(normalized.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(normalized)) {
      throw new Error(`${label} contains conflicting records for ID ${normalized.id}`);
    }
    if (!previous) seen.set(normalized.id, normalized);
  }
  return [...seen.values()];
}

function difference(values, baseline) {
  const known = new Set(baseline);
  return values.filter((value) => !known.has(value));
}

export function buildWatchBatch(input) {
  object(input, "batch input");
  const target = parseTarget(input.target);
  if (!target.repository) throw new Error("watch batch target must be a canonical PR URL");
  if (!WATCH_MODES.has(input.mode)) throw new Error("watch mode must be default or authorized");
  if (input.fetchOk !== true || input.paginationComplete !== true) {
    throw new Error("watch batch requires a complete successful fetch");
  }
  const viewerLogin = string(input.viewerLogin, "viewerLogin");
  const observed = identityState(input.observed, "observed");
  const triaged = identityState(input.triaged, "triaged");
  for (const key of ["threads", "issueComments", "reviews"]) {
    if (!Array.isArray(input[key])) throw new Error(`${key} must be an array`);
  }

  const threads = dedupe(input.threads, "threads", (record, label) => {
    const thread = object(record, label);
    if (typeof thread.isResolved !== "boolean") throw new Error(`${label}.isResolved must be boolean`);
    const comments = object(thread.comments, `${label}.comments`);
    if (!Array.isArray(comments.nodes)) {
      throw new Error(`${label}.comments.nodes must be an array`);
    }
    const normalizedComments = dedupe(
      comments.nodes,
      `${label}.comments.nodes`,
      (record, commentLabel) => {
        const comment = object(record, commentLabel);
        return {
          id: nodeId(comment.id, `${commentLabel}.id`),
          author: authorLogin(comment.author, `${commentLabel}.author`),
        };
      },
    );
    const latestExternal = normalizedComments
      .filter(({ author }) => author?.toLowerCase() !== viewerLogin.toLowerCase())
      .at(-1);
    return {
      id: nodeId(thread.id, `${label}.id`),
      latestCommentId: latestExternal?.id ?? null,
      isResolved: thread.isResolved,
    };
  }).filter((thread) => !thread.isResolved && thread.latestCommentId !== null);

  const issueComments = dedupe(input.issueComments, "issueComments", (record, label) => {
    const comment = object(record, label);
    return {
      kind: "issue-comment",
      id: nodeId(comment.id, `${label}.id`),
      author: authorLogin(comment.author, `${label}.author`),
      body: string(comment.body, `${label}.body`, { allowEmpty: true }),
      createdAt: timestamp(comment.createdAt, `${label}.createdAt`),
      url: githubUrl(comment.url, `${label}.url`),
      ownComment: false,
      viewerReactions: viewerReactions(comment.reactionGroups, `${label}.reactionGroups`),
    };
  }).filter((comment) => comment.author?.toLowerCase() !== viewerLogin.toLowerCase());

  const reviews = dedupe(input.reviews, "reviews", (record, label) => {
    const review = object(record, label);
    const state = string(review.state, `${label}.state`);
    if (!REVIEW_STATES.has(state)) throw new Error(`${label}.state is invalid`);
    return {
      kind: "review-body",
      id: nodeId(review.id, `${label}.id`),
      author: authorLogin(review.author, `${label}.author`),
      body: string(review.body, `${label}.body`, { allowEmpty: true }),
      url: githubUrl(review.url, `${label}.url`),
      submittedAt: review.submittedAt === null
        ? null
        : timestamp(review.submittedAt, `${label}.submittedAt`),
      state,
      ownComment: false,
      viewerReactions: viewerReactions(review.reactionGroups, `${label}.reactionGroups`),
    };
  }).filter((review) => (
    review.submittedAt !== null &&
    review.state !== "PENDING" &&
    review.body.trim().length > 0 &&
    review.author?.toLowerCase() !== viewerLogin.toLowerCase()
  ));

  const current = {
    threadIds: threads.map(({ id }) => id),
    threadCommentIds: threads.map(({ latestCommentId }) => latestCommentId),
    issueCommentIds: issueComments.map(({ id }) => id),
    reviewIds: reviews.map(({ id }) => id),
  };
  const currentThreadIds = new Set(current.threadIds);
  const currentThreadCommentIds = new Set(current.threadCommentIds);
  const retainedTriaged = {
    ...triaged,
    threadIds: triaged.threadIds.filter((id) => currentThreadIds.has(id)),
    threadCommentIds: triaged.threadCommentIds.filter((id) => currentThreadCommentIds.has(id)),
  };
  const pendingThreads = threads.filter(
    ({ id, latestCommentId }) =>
      !retainedTriaged.threadIds.includes(id) ||
      !retainedTriaged.threadCommentIds.includes(latestCommentId),
  );
  const pendingCommentIds = new Set(
    difference(current.issueCommentIds, retainedTriaged.issueCommentIds),
  );
  const pendingReviewIds = new Set(
    difference(current.reviewIds, retainedTriaged.reviewIds),
  );

  return {
    schema: 1,
    source: "pr-watch-as-author",
    target: target.target,
    mode: input.mode,
    observed: current,
    triaged: retainedTriaged,
    changes: {
      threadIds: difference(current.threadIds, observed.threadIds),
      threadCommentIds: difference(current.threadCommentIds, observed.threadCommentIds),
      issueCommentIds: difference(current.issueCommentIds, observed.issueCommentIds),
      reviewIds: difference(current.reviewIds, observed.reviewIds),
    },
    batch: {
      threads: pendingThreads.map(({ id, latestCommentId }) => ({ id, latestCommentId })),
      feedback: [
        ...issueComments.filter(({ id }) => pendingCommentIds.has(id)),
        ...reviews.filter(({ id }) => pendingReviewIds.has(id)),
      ],
    },
  };
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

export function evaluatePoll(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("poll input must be an object");
  }
  if (!Number.isInteger(input.cycle) || input.cycle < 0 || input.cycle > 48) {
    throw new Error("cycle must be an integer from 0 through 48");
  }
  if (!Number.isInteger(input.consecutiveFailures) || input.consecutiveFailures < 0 || input.consecutiveFailures > 2) {
    throw new Error("consecutiveFailures must be an integer from 0 through 2");
  }
  if (typeof input.fetchOk !== "boolean" || typeof input.paginationComplete !== "boolean") {
    throw new Error("fetchOk and paginationComplete must be boolean");
  }

  const failed = !input.fetchOk || !input.paginationComplete;
  const failures = failed ? input.consecutiveFailures + 1 : 0;
  if (failures === 3) return { event: "stop", reason: "poll-failures", failures, nextCycle: null };
  if (failed && input.cycle === 48) return { event: "stop", reason: "timeout", failures, nextCycle: null };
  if (failed) return { event: "retry", reason: "poll-failure", failures, nextCycle: input.cycle + 1 };
  if (!STATES.has(input.state)) throw new Error("invalid PR state");
  const reviewDecision = input.reviewDecision === "" ? null : input.reviewDecision ?? null;
  if (!DECISIONS.has(reviewDecision)) throw new Error("invalid review decision");
  if (input.state === "MERGED" || input.state === "CLOSED") {
    return { event: "stop", reason: input.state.toLowerCase(), failures, nextCycle: null, reviewDecision };
  }
  if (reviewDecision === "APPROVED") {
    return { event: "final-triage", reason: "approved", failures, nextCycle: null, reviewDecision };
  }
  if (input.cycle === 48) return { event: "stop", reason: "timeout", failures, nextCycle: null, reviewDecision };
  return { event: "continue", reason: null, failures, nextCycle: input.cycle + 1, reviewDecision };
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function main() {
  try {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === "query" && args.length === 0) process.stdout.write(`${pollQuery()}\n`);
    else if (mode === "thread-comments-query" && args.length === 0) {
      process.stdout.write(`${threadCommentsQuery()}\n`);
    }
    else if (mode === "target" && args.length === 0) output(parseTarget(readFileSync(0, "utf8")));
    else if (mode === "head" && args.length === 0) {
      output(verifyHead(JSON.parse(readFileSync(0, "utf8")), gitContext()));
    }
    else if (mode === "poll" && args.length === 0) {
      output(evaluatePoll(JSON.parse(readFileSync(0, "utf8"))));
    }
    else if (mode === "batch" && args.length === 0) {
      output(buildWatchBatch(JSON.parse(readFileSync(0, "utf8"))));
    } else throw new Error("usage: poll-state.mjs query|thread-comments-query | target < target.txt | head|poll|batch < input.json");
  } catch (error) {
    process.stderr.write(`poll-state: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
