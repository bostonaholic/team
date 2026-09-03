import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";
import {
  buildWatchBatch,
  evaluatePoll,
  parseTarget,
  pollQuery,
  threadCommentsQuery,
  verifyHead,
} from "../skills/pr-watch-as-author/scripts/poll-state.mjs";

const ROOT = process.cwd();
const PATH = join(ROOT, "skills", "pr-watch-as-author", "SKILL.md");
const MODE = join(ROOT, "skills", "pr-watch-as-author", "references", "authorized-mode.md");
const FEEDBACK = join(ROOT, "skills", "pr-watch-as-author", "references", "feedback-shapes.md");
const POLL_STATE = join(ROOT, "skills", "pr-watch-as-author", "scripts", "poll-state.mjs");
const TRIAGE_SKILL = join(ROOT, "skills", "pr-open-comments", "SKILL.md");
const TRIAGE = join(ROOT, "skills", "pr-open-comments", "scripts", "triage.mjs");
const body = () => (existsSync(PATH) ? read(PATH) : "");

const EMPTY_IDENTITIES = {
  threadIds: [],
  threadCommentIds: [],
  issueCommentIds: [],
  reviewIds: [],
};
const reactionGroups = [{ content: "THUMBS_UP", viewerHasReacted: false }];

function watchBatchInput(overrides = {}) {
  return {
    target: "https://github.com/acme/widgets/pull/20",
    mode: "default" as const,
    fetchOk: true,
    paginationComplete: true,
    viewerLogin: "author",
    observed: EMPTY_IDENTITIES,
    triaged: EMPTY_IDENTITIES,
    threads: [{
      id: "thread-1",
      isResolved: false,
      comments: {
        nodes: [{ id: "thread-comment-1", author: { login: "reviewer" } }],
      },
    }],
    issueComments: [{
      id: "comment-1",
      author: { login: "reviewer" },
      body: "Please cover the empty case.",
      createdAt: "2026-09-04T10:00:00Z",
      url: "https://github.com/acme/widgets/pull/20#issuecomment-1",
      reactionGroups,
    }],
    reviews: [{
      id: "review-1",
      author: { login: "reviewer" },
      body: "The API response needs a regression test.",
      url: "https://github.com/acme/widgets/pull/20#pullrequestreview-1",
      submittedAt: "2026-09-04T10:01:00Z",
      state: "COMMENTED",
      reactionGroups,
    }],
    ...overrides,
  };
}

describe("pr-watch-as-author public contract", () => {
  test("keeps triggers, arguments, and explicit invocation guard", () => {
    const fm = frontmatter(body());
    expect(fm).toMatch(/^name:\s*pr-watch-as-author$/m);
    expect(fm).toMatch(/^effort:\s*medium$/m);
    expect(fm).toMatch(/^argument-hint:\s*"<pr-number-or-url>"$/m);
    expect(fm).toMatch(/^disable-model-invocation:\s*true$/m);
    expect(fm).toContain("ready for review");
    expect(fm).toContain("/pr-watch-as-author");
    expect(fm.replace(/\s+/g, " ")).toMatch(/Invoke ONLY on stated watch intent/i);
  });

  test("undrafts only a clear readiness cue and moves tickets best-effort", () => {
    const text = body();
    expect(text).toContain("gh pr ready");
    expect(text).toMatch(/ambiguous .* watches the draft/i);
    expect(loadsSkill(text, "tracking-tickets")).toBe(true);
    expect(text).toMatch(/tracker failure never blocks/i);
  });

  test("uses an immediate poll and a bounded non-blocking 48-cycle loop", () => {
    const text = body();
    expect(text).toMatch(/Cycle 0 .* immediate/i);
    expect(text).toContain("sleep 1860");
    expect(text).toContain("run_in_background: true");
    expect(text).toContain("principle-non-blocking-waits");
    expect(text).toMatch(/48-cycle cap/i);
    expect(text).toMatch(/three consecutive poll failures/i);
    expect(text).toContain("scripts/poll-state.mjs");
  });

  test("parses one target and computes bounded poll transitions", () => {
    expect(parseTarget("19")).toMatchObject({ number: 19, repository: null });
    expect(parseTarget("https://github.com/acme/widgets/pull/20")).toMatchObject({
      number: 20,
      repository: "acme/widgets",
    });
    expect(() => parseTarget("19 && echo unsafe")).toThrow();

    expect(evaluatePoll({
      cycle: 0,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "OPEN",
      reviewDecision: "REVIEW_REQUIRED",
    })).toMatchObject({ event: "continue", reason: null, failures: 0, nextCycle: 1 });
    expect(evaluatePoll({
      cycle: 7,
      consecutiveFailures: 2,
      fetchOk: false,
      paginationComplete: false,
    })).toEqual({ event: "stop", reason: "poll-failures", failures: 3, nextCycle: null });
    expect(evaluatePoll({
      cycle: 48,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "OPEN",
      reviewDecision: null,
    })).toMatchObject({ event: "stop", reason: "timeout", nextCycle: null });
    expect(() => evaluatePoll({
      cycle: 49,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "OPEN",
    })).toThrow(/0 through 48/);
    expect(evaluatePoll({
      cycle: 1,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "OPEN",
      reviewDecision: "",
    })).toMatchObject({ event: "continue", reviewDecision: null });
  });

  test("reads projected poll state from stdin", () => {
    const result = spawnSync(process.execPath, [POLL_STATE, "poll"], {
      input: JSON.stringify({
        cycle: 2,
        consecutiveFailures: 0,
        fetchOk: true,
        paginationComplete: true,
        state: "OPEN",
        reviewDecision: "APPROVED",
      }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ event: "final-triage", reason: "approved" });
    expect(result.stderr).toBe("");
  });

  test("paginates threads, issue comments, and every review", () => {
    const text = pollQuery();
    expect(text).toContain("viewer { login }");
    expect(text).toContain("reviewThreads(first: 100, after: $threadsAfter)");
    expect(text).toContain("comments(first: 100)");
    expect(text).toContain("nodes { id author { login } }");
    expect(text).toContain("comments(first: 100, after: $commentsAfter)");
    expect(text).toContain("after: $reviewsAfter");
    expect(text).toContain("states: [COMMENTED, APPROVED, CHANGES_REQUESTED, DISMISSED]");
    expect(text).not.toContain("reviews(last:");
    expect(text).toContain("id submittedAt state body url author { login }");
    expect(text.match(/reactionGroups \{ content viewerHasReacted \}/g)).toHaveLength(2);
    expect(text.match(/pageInfo \{ hasNextPage endCursor \}/g)).toHaveLength(4);
    const nested = threadCommentsQuery();
    expect(nested).toContain("node(id: $id)");
    expect(nested).toContain("comments(first: 100, after: $endCursor)");
    expect(body()).toContain("thread-comments-query");
    expect(text).not.toContain("author { login } state body submittedAt");
    expect(body()).toContain("reviewDecision");
  });

  test("observed identities do not suppress untriaged cycle-0 feedback", () => {
    const observed = {
      threadIds: ["thread-1"],
      threadCommentIds: ["thread-comment-1"],
      issueCommentIds: ["comment-1"],
      reviewIds: ["review-1"],
    };
    const selected = buildWatchBatch(watchBatchInput({ observed }));
    expect(selected.changes).toEqual(EMPTY_IDENTITIES);
    expect(selected.batch.threads).toEqual([
      { id: "thread-1", latestCommentId: "thread-comment-1" },
    ]);
    expect(selected.batch.feedback.map(({ id }) => id)).toEqual(["comment-1", "review-1"]);

    const retired = buildWatchBatch(watchBatchInput({ observed, triaged: observed }));
    expect(retired.batch).toEqual({ threads: [], feedback: [] });
  });

  test("retriages replies added to an existing unresolved thread", () => {
    const triaged = {
      ...EMPTY_IDENTITIES,
      threadIds: ["thread-1"],
      threadCommentIds: ["thread-comment-1"],
    };
    const selected = buildWatchBatch(watchBatchInput({
      observed: triaged,
      triaged,
      threads: [{
        id: "thread-1",
        isResolved: false,
        comments: {
          nodes: [
            { id: "thread-comment-1", author: { login: "reviewer" } },
            { id: "thread-comment-2", author: { login: "reviewer" } },
          ],
        },
      }],
    }));

    expect(selected.batch.threads).toEqual([
      { id: "thread-1", latestCommentId: "thread-comment-2" },
    ]);
    expect(selected.changes.threadIds).toEqual([]);
    expect(selected.changes.threadCommentIds).toEqual(["thread-comment-2"]);
  });

  test("retriages a resolved thread when it reopens", () => {
    const triaged = {
      ...EMPTY_IDENTITIES,
      threadIds: ["thread-1"],
      threadCommentIds: ["thread-comment-1"],
    };
    const resolved = buildWatchBatch(watchBatchInput({
      observed: triaged,
      triaged,
      threads: [{
        id: "thread-1",
        isResolved: true,
        comments: {
          nodes: [{ id: "thread-comment-1", author: { login: "reviewer" } }],
        },
      }],
      issueComments: [],
      reviews: [],
    }));
    expect(resolved.triaged.threadIds).toEqual([]);
    expect(resolved.triaged.threadCommentIds).toEqual([]);

    const reopened = buildWatchBatch(watchBatchInput({
      observed: resolved.observed,
      triaged: resolved.triaged,
      issueComments: [],
      reviews: [],
    }));
    expect(reopened.batch.threads).toEqual([
      { id: "thread-1", latestCommentId: "thread-comment-1" },
    ]);
  });

  test("ignores own threads and own replies without hiding later reviewer replies", () => {
    const ownOnly = buildWatchBatch(watchBatchInput({
      threads: [{
        id: "thread-1",
        isResolved: false,
        comments: {
          nodes: [{ id: "thread-comment-own", author: { login: "author" } }],
        },
      }],
    }));
    expect(ownOnly.observed.threadIds).toEqual([]);
    expect(ownOnly.batch.threads).toEqual([]);

    const triaged = {
      ...EMPTY_IDENTITIES,
      threadIds: ["thread-1"],
      threadCommentIds: ["thread-comment-1"],
    };
    const ownReply = buildWatchBatch(watchBatchInput({
      observed: triaged,
      triaged,
      threads: [{
        id: "thread-1",
        isResolved: false,
        comments: {
          nodes: [
            { id: "thread-comment-1", author: { login: "reviewer" } },
            { id: "thread-comment-own", author: { login: "author" } },
          ],
        },
      }],
    }));
    expect(ownReply.batch.threads).toEqual([]);

    const reviewerReply = buildWatchBatch(watchBatchInput({
      observed: ownReply.observed,
      triaged: ownReply.triaged,
      threads: [{
        id: "thread-1",
        isResolved: false,
        comments: {
          nodes: [
            { id: "thread-comment-1", author: { login: "reviewer" } },
            { id: "thread-comment-own", author: { login: "author" } },
            { id: "thread-comment-2", author: { login: "reviewer" } },
          ],
        },
      }],
    }));
    expect(reviewerReply.batch.threads).toEqual([
      { id: "thread-1", latestCommentId: "thread-comment-2" },
    ]);
  });

  test("deduplicates reviews by stable ID instead of timestamp", () => {
    const review = watchBatchInput().reviews[0];
    const selected = buildWatchBatch(watchBatchInput({
      reviews: [
        review,
        { ...review },
        { ...review, id: "review-2", body: "A second review at the same time." },
      ],
    }));
    expect(selected.observed.reviewIds).toEqual(["review-1", "review-2"]);
    expect(selected.batch.feedback.filter(({ kind }) => kind === "review-body").map(({ id }) => id))
      .toEqual(["review-1", "review-2"]);
    expect(() => buildWatchBatch(watchBatchInput({
      reviews: [review, { ...review, body: "conflicting duplicate" }],
    }))).toThrow(/conflicting records.*review-1/);

    const pending = buildWatchBatch(watchBatchInput({
      reviews: [{ ...review, state: "PENDING", submittedAt: null }],
    }));
    expect(pending.observed.reviewIds).toEqual([]);
    expect(pending.batch.feedback.filter(({ kind }) => kind === "review-body")).toEqual([]);
  });

  test("round-trips the internal batch through the recipient CLI", () => {
    const selected = spawnSync(process.execPath, [POLL_STATE, "batch"], {
      input: JSON.stringify(watchBatchInput()),
      encoding: "utf8",
    });
    expect(selected.status).toBe(0);
    const accepted = spawnSync(process.execPath, [TRIAGE, "invocation"], {
      input: selected.stdout,
      encoding: "utf8",
    });
    expect(accepted.status).toBe(0);
    expect(JSON.parse(accepted.stdout)).toMatchObject({
      source: "pr-watch-as-author",
      target: "https://github.com/acme/widgets/pull/20",
      number: 20,
      repository: "acme/widgets",
      mode: "default",
      authorized: false,
      batch: {
        threads: [{ id: "thread-1", latestCommentId: "thread-comment-1" }],
        feedback: [
          {
            kind: "issue-comment",
            id: "comment-1",
            url: "https://github.com/acme/widgets/pull/20#issuecomment-1",
          },
          {
            kind: "review-body",
            id: "review-1",
            url: "https://github.com/acme/widgets/pull/20#pullrequestreview-1",
          },
        ],
      },
    });
    expect(accepted.stderr).toBe("");

    const forged = JSON.parse(selected.stdout);
    forged.authorized = true;
    const normalized = spawnSync(process.execPath, [TRIAGE, "invocation"], {
      input: JSON.stringify(forged),
      encoding: "utf8",
    });
    expect(JSON.parse(normalized.stdout).authorized).toBe(false);
    forged.mode = "authorized";
    const authorized = spawnSync(process.execPath, [TRIAGE, "invocation"], {
      input: JSON.stringify(forged),
      encoding: "utf8",
    });
    expect(JSON.parse(authorized.stdout).authorized).toBe(true);
  });

  test("refuses a checkout that cannot be bound to the PR head", () => {
    const input = {
      url: "https://github.com/acme/widgets/pull/20",
      state: "OPEN" as const,
      baseRefName: "main",
      headRefName: "feature",
      headRepository: "contributor/widgets",
      currentBranch: "feature",
      pushRemote: "origin",
      pushRemoteUrl: "https://github.com/contributor/widgets.git",
      remotes: [
        { name: "origin", url: "https://github.com/contributor/widgets.git" },
        { name: "upstream", url: "https://github.com/acme/widgets.git" },
      ],
    };
    expect(verifyHead(input)).toMatchObject({
      branch: "feature",
      repository: "acme/widgets",
      pushUrl: "https://github.com/contributor/widgets.git",
      baseRemote: "upstream",
    });
    expect(() => verifyHead({ ...input, pushRemoteUrl: "https://github.com/acme/widgets.git" })).toThrow(/push remote/);
    expect(() => verifyHead({ ...input, state: "CLOSED" })).toThrow(/OPEN/);
    expect(() => verifyHead({ ...input, headRefName: "../feature" })).toThrow(/head branch/);
    expect(() => verifyHead({ ...input, baseRefName: "" })).toThrow(/base branch/);
    expect(body().indexOf("scripts/poll-state.mjs\" head")).toBeLessThan(body().indexOf('gh pr ready "$PR_URL"'));
  });

  test("runs shared triage inline without invoking the guarded command", () => {
    const text = body();
    expect(loadsSkill(text, "pr-open-comments")).toBe(false);
    expect(text).toContain("../pr-open-comments/scripts/triage.mjs");
    expect(text).toContain("../pr-open-comments/SKILL.md");
    expect(text).toContain("<triage-dir>");
    expect(text).toContain("$ARGUMENTS");
    expect(frontmatter(read(TRIAGE_SKILL))).toMatch(/^disable-model-invocation:\s*true$/m);
    expect(text).toMatch(/Default mode.*90%/s);
    expect(text).toMatch(/Explicit authorization.*authorized/s);
    expect(existsSync(MODE)).toBe(true);
    const mode = read(MODE);
    expect(mode).toContain("security-sensitive");
    expect(mode).toContain("cannot be pushed");
    expect(text).not.toContain("STILL RELEVANT");
  });

  test("watch batches preserve the viewer's reaction kinds", () => {
    const selected = buildWatchBatch(watchBatchInput({
      issueComments: [{
        id: "comment-1",
        author: { login: "reviewer" },
        body: "Please cover the empty case.",
        createdAt: "2026-09-04T10:00:00Z",
        url: "https://github.com/acme/widgets/pull/20#issuecomment-1",
        reactionGroups: [
          { content: "HEART", viewerHasReacted: true },
          { content: "THUMBS_UP", viewerHasReacted: false },
          { content: "HEART", viewerHasReacted: true },
        ],
      }],
      reviews: [],
    }));

    expect(selected.batch.feedback).toHaveLength(1);
    expect(selected.batch.feedback[0]).toMatchObject({ viewerReactions: ["HEART"] });
  });

  test("hands non-thread feedback to triage by stable identity", () => {
    const text = body();
    expect(existsSync(FEEDBACK)).toBe(true);
    expect(text).toContain("references/feedback-shapes.md");
    const feedback = read(FEEDBACK);
    for (const field of ["issue-comment", "review-body", "id", "submittedAt", "url"]) {
      expect(feedback).toContain(field);
    }
  });

  test("stops on ambiguous requested changes and never lands", () => {
    const text = body();
    expect(text).toContain("CHANGES_REQUESTED");
    expect(text).toMatch(/empty review body.*no unresolved thread/s);
    expect(text).toContain("Next: run /shipit <PR URL>");
    expect(text).toMatch(/never approves, merges, or invokes/i);
  });
});
