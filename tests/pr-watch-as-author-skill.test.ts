import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";
import {
  buildWatchBatch,
  evaluatePoll,
  parsePushRepository,
  parseTarget,
  pollQuery,
  threadCommentsQuery,
  validateBinding,
} from "../skills/pr-watch-as-author/scripts/poll-state.mjs";

const ROOT = process.cwd();
const PATH = join(ROOT, "skills", "pr-watch-as-author", "SKILL.md");
const MODE = join(ROOT, "skills", "pr-watch-as-author", "references", "authorized-mode.md");
const FEEDBACK = join(ROOT, "skills", "pr-watch-as-author", "references", "feedback-shapes.md");
const POLL_STATE = join(ROOT, "skills", "pr-watch-as-author", "scripts", "poll-state.mjs");
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
      comments: { nodes: [{ id: "thread-comment-1", author: { login: "reviewer" } }] },
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
    expect(fm).toMatch(/^argument-hint:.*pr-number-or-url/m);
    expect(fm).not.toMatch(/^disable-model-invocation:/m);
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

  test("accepts the current branch or one target and computes bounded transitions", () => {
    expect(parseTarget("")).toEqual({ target: null, number: null, repository: null });
    expect(parseTarget("19")).toMatchObject({ number: 19, repository: null });
    expect(parseTarget("https://github.com/acme/widgets/pull/20")).toMatchObject({
      number: 20,
      repository: "acme/widgets",
    });
    expect(() => parseTarget("0")).toThrow(/positive integer/);
    expect(() => parseTarget("9007199254740992")).toThrow(/positive integer/);
    expect(() => parseTarget("19 && echo unsafe")).toThrow();

    expect(evaluatePoll({
      cycle: 0,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "OPEN",
      reviewDecision: "REVIEW_REQUIRED",
    })).toEqual({ event: "continue", reason: null, failures: 0, nextCycle: 1 });
    expect(evaluatePoll({
      cycle: 1,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "OPEN",
      reviewDecision: "",
    })).toEqual({ event: "continue", reason: null, failures: 0, nextCycle: 2 });
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
    expect(evaluatePoll({
      cycle: 48,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "OPEN",
      reviewDecision: "APPROVED",
    })).toMatchObject({ event: "final-triage", reason: "approved" });
    expect(() => evaluatePoll({
      cycle: 49,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "OPEN",
    })).toThrow(/0 through 48/);
  });

  test("reads raw targets only from stdin without executing them", () => {
    const directory = mkdtempSync(join(tmpdir(), "team-author-watch-target-"));
    const marker = join(directory, "injected");
    try {
      const empty = spawnSync(process.execPath, [POLL_STATE, "target"], {
        input: "",
        encoding: "utf8",
      });
      expect(empty.status).toBe(0);
      expect(JSON.parse(empty.stdout)).toEqual({ target: null, number: null, repository: null });

      const injected = spawnSync(process.execPath, [POLL_STATE, "target"], {
        input: `19; touch ${marker}`,
        encoding: "utf8",
      });
      expect(injected.status).toBe(2);
      expect(existsSync(marker)).toBe(false);
      expect(body()).not.toContain('target "$ARGUMENTS"');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("binds fork PRs and rejects branch or push-remote mismatches", () => {
    expect(parsePushRepository("ssh://git@github.com/forker/widgets.git")).toBe("forker/widgets");
    const metadata = {
      url: "https://github.com/upstream/widgets/pull/24",
      number: 24,
      state: "OPEN",
      headRefName: "feature",
      headRepository: { name: "widgets", nameWithOwner: "forker/widgets" },
      headRepositoryOwner: { login: "forker" },
    };
    const context = {
      currentBranch: "feature",
      pushRemote: "fork",
      pushRemoteUrls: ["ssh://git@github.com/forker/widgets.git"],
    };
    expect(validateBinding(metadata, context)).toMatchObject({
      canonicalUrl: metadata.url,
      owner: "upstream",
      headRepository: "forker/widgets",
      pushRemote: "fork",
    });
    expect(() => validateBinding(metadata, { ...context, currentBranch: "other" }))
      .toThrow(/current branch/);
    expect(() => validateBinding(metadata, {
      ...context,
      pushRemoteUrls: ["ssh://git@github.com/other/widgets.git"],
    })).toThrow(/push remote/);
    expect(() => validateBinding({ ...metadata, state: "MERGED" }, context)).toThrow(/open/);

    const directory = mkdtempSync(join(tmpdir(), "team-author-watch-bind-"));
    try {
      expect(spawnSync("git", ["init", "-q", "-b", "feature"], { cwd: directory }).status).toBe(0);
      expect(spawnSync("git", ["remote", "add", "fork", context.pushRemoteUrls[0]!], {
        cwd: directory,
      }).status).toBe(0);
      expect(spawnSync("git", ["config", "remote.pushDefault", "fork"], {
        cwd: directory,
      }).status).toBe(0);
      const bound = spawnSync(process.execPath, [POLL_STATE, "bind"], {
        cwd: directory,
        input: JSON.stringify(metadata),
        encoding: "utf8",
      });
      expect(bound.status).toBe(0);
      expect(JSON.parse(bound.stdout)).toMatchObject({ pushRemote: "fork", currentBranch: "feature" });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("binds before undrafting and uses the canonical URL afterward", () => {
    const text = body();
    const bind = text.indexOf('scripts/poll-state.mjs" bind');
    const ready = text.indexOf('gh pr ready "$PR_URL"', bind);
    const poll = text.indexOf('gh pr view "$PR_URL"', ready);
    expect(bind).toBeGreaterThan(-1);
    expect(ready).toBeGreaterThan(bind);
    expect(poll).toBeGreaterThan(ready);
    expect(text).toMatch(/pr-open-comments.*canonical PR URL/s);
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
        prose: "$(touch should-not-run)",
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
    expect(text).not.toContain("author { login } state body submittedAt");
    const nested = threadCommentsQuery();
    expect(nested).toContain("node(id: $id)");
    expect(nested).toContain("comments(first: 100, after: $endCursor)");
    expect(nested).toContain("nodes { id author { login } }");
    expect(body()).toContain("thread-comments-query");
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

  test("preserves the viewer's reacted contents in non-thread feedback", () => {
    const selected = buildWatchBatch(watchBatchInput({
      issueComments: [{
        ...watchBatchInput().issueComments[0],
        reactionGroups: [
          { content: "HEART", viewerHasReacted: true },
          { content: "THUMBS_UP", viewerHasReacted: false },
          { content: "HEART", viewerHasReacted: true },
        ],
      }],
      reviews: [{
        ...watchBatchInput().reviews[0],
        reactionGroups: [{ content: "THUMBS_DOWN", viewerHasReacted: true }],
      }],
    }));

    expect(selected.batch.feedback).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "comment-1", viewerReactions: ["HEART"] }),
      expect.objectContaining({ id: "review-1", viewerReactions: ["THUMBS_DOWN"] }),
    ]));
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
        comments: { nodes: [{ id: "thread-comment-2", author: { login: "reviewer" } }] },
      }],
    }));

    expect(selected.batch.threads).toEqual([
      { id: "thread-1", latestCommentId: "thread-comment-2" },
    ]);
    expect(selected.changes.threadIds).toEqual([]);
    expect(selected.changes.threadCommentIds).toEqual(["thread-comment-2"]);
  });

  test("ignores author replies but retriages the next reviewer reply", () => {
    const ownOnly = buildWatchBatch(watchBatchInput({
      threads: [{
        id: "thread-1",
        isResolved: false,
        comments: { nodes: [{ id: "thread-comment-own", author: { login: "author" } }] },
      }],
    }));
    expect(ownOnly.observed.threadIds).toEqual([]);
    expect(ownOnly.batch.threads).toEqual([]);

    const triaged = {
      ...EMPTY_IDENTITIES,
      threadIds: ["thread-1"],
      threadCommentIds: ["thread-comment-1"],
    };
    const authorReply = buildWatchBatch(watchBatchInput({
      observed: triaged,
      triaged,
      threads: [{
        id: "thread-1",
        isResolved: false,
        comments: { nodes: [
          { id: "thread-comment-1", author: { login: "reviewer" } },
          { id: "thread-comment-2", author: { login: "author" } },
        ] },
      }],
      issueComments: [],
      reviews: [],
    }));
    expect(authorReply.batch.threads).toEqual([]);
    expect(authorReply.observed.threadCommentIds).toEqual(["thread-comment-1"]);

    const reviewerReply = buildWatchBatch(watchBatchInput({
      observed: authorReply.observed,
      triaged: authorReply.triaged,
      threads: [{
        id: "thread-1",
        isResolved: false,
        comments: { nodes: [
          { id: "thread-comment-1", author: { login: "reviewer" } },
          { id: "thread-comment-2", author: { login: "author" } },
          { id: "thread-comment-3", author: { login: "reviewer" } },
        ] },
      }],
      issueComments: [],
      reviews: [],
    }));
    expect(reviewerReply.batch.threads).toEqual([
      { id: "thread-1", latestCommentId: "thread-comment-3" },
    ]);
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
        comments: { nodes: [{ id: "thread-comment-1", author: { login: "reviewer" } }] },
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

  test("delegates triage and keeps default versus authorized behavior distinct", () => {
    const text = body();
    expect(loadsSkill(text, "pr-open-comments")).toBe(true);
    expect(text).toMatch(/Default mode.*90%/s);
    expect(text).toMatch(/Explicit authorization.*authorized/s);
    expect(existsSync(MODE)).toBe(true);
    const mode = read(MODE);
    expect(mode).toContain("security-sensitive");
    expect(mode).toContain("cannot be pushed");
    expect(text).not.toContain("STILL RELEVANT");
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
    expect(text).toContain("Next: run /shipit");
    expect(text).toMatch(/never approves, merges, or invokes/i);
  });
});
