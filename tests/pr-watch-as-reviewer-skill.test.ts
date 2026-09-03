import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import {
  evaluateConfirmation,
  evaluateGate,
  evaluatePoll,
  parseTarget,
  requireApproval,
} from "../skills/pr-watch-as-reviewer/scripts/evaluate-gate.mjs";

const ROOT = process.cwd();
const PATH = join(ROOT, "skills", "pr-watch-as-reviewer", "SKILL.md");
const VERDICTS = join(ROOT, "skills", "pr-watch-as-reviewer", "references", "verdicts.md");
const RECOVERY = join(ROOT, "skills", "pr-watch-as-reviewer", "references", "recovery.md");
const body = () => (existsSync(PATH) ? read(PATH) : "");
const flat = (value: string) => value.replace(/\s+/g, " ");

describe("pr-watch-as-reviewer public contract", () => {
  test("is explicit-only because approval can transitively merge", () => {
    const fm = frontmatter(body());
    expect(fm).toMatch(/^name:\s*pr-watch-as-reviewer$/m);
    expect(fm).toMatch(/^effort:\s*medium$/m);
    expect(fm).toMatch(/^argument-hint:\s*"<pr-number-or-url>"$/m);
    expect(fm).toMatch(/^disable-model-invocation:\s*true$/m);
    const normalized = flat(fm);
    expect(normalized).toContain("approve the PR when my comments are resolved");
    expect(normalized).toContain("watch and approve");
    expect(normalized).toContain("/pr-watch-as-reviewer");
  });

  test("validates arguments before a projected canonical PR read", () => {
    const text = body();
    expect(parseTarget("42\n")).toMatchObject({ number: 42, repository: null });
    expect(parseTarget("https://github.com/acme/widgets/pull/42")).toMatchObject({ repository: "acme/widgets" });
    expect(() => parseTarget("42;echo unsafe")).toThrow();
    expect(text).not.toContain("${BASH_REMATCH[");
    expect(text).not.toContain("[^/]+/[^/]+/pull");
    expect(text).toContain('gh pr view "$ARG_NUMBER" --repo "$ARG_OWNER/$ARG_REPO"');
    expect(text).toContain('gh pr view "$ARG_NUMBER" --json "$FIELDS"');
    expect(text).toContain("FIELDS=url,number,state,isDraft,author,autoMergeRequest,headRefOid,latestReviews");
    expect(text).toContain("latestReviewStates");
    expect(text).toMatch(/Bind .* only from returned `url`/s);
  });

  test("tracks only the viewer's submitted feedback and refuses rubber stamping", () => {
    const text = body();
    expect(text).toContain("viewer { login }");
    expect(text).toMatch(/Refuse self-review/i);
    expect(text).toMatch(/bodies of\s+only `\$VIEWER`'s plain comments/i);
    expect(text).toContain("reviews(last: 1, states: [PENDING])");
    expect(text).toMatch(/viewer has no submitted thread and no tracked plain comment/i);
    expect(text).toMatch(/Membership is fixed by comment ID until re-arm/i);
  });

  test("uses 48 bounded non-blocking cycles and complete pagination", () => {
    const text = body();
    expect(text).toContain("sleep 1860");
    expect(text).toContain("run_in_background: true");
    expect(text).toContain("principle-non-blocking-waits");
    expect(text).toContain("48-cycle cap");
    expect(text).toContain("reviewThreads(first: 100)");
    expect(text).toContain("hasNextPage endCursor");
    expect(text).toContain("after:");
  });

  test("bounds poll failures, cycles, and confirmation churn mechanically", () => {
    expect(evaluatePoll({
      cycle: 0,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "OPEN",
    })).toEqual({ action: "continue", reason: null, failures: 0, nextCycle: 1 });
    expect(evaluatePoll({
      cycle: 9,
      consecutiveFailures: 2,
      fetchOk: false,
      paginationComplete: false,
    })).toEqual({ action: "stop", reason: "poll-failures", failures: 3, nextCycle: null });
    expect(evaluatePoll({
      cycle: 48,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "OPEN",
    })).toMatchObject({ action: "stop", reason: "timeout", nextCycle: null });
    expect(evaluatePoll({
      cycle: 2,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "MERGED",
    })).toMatchObject({ action: "stop", reason: "merged" });
    expect(() => evaluatePoll({
      cycle: 49,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "OPEN",
    })).toThrow(/0 through 48/);

    expect(evaluateConfirmation({ round: 1, changed: false })).toMatchObject({ action: "proceed" });
    expect(evaluateConfirmation({ round: 1, changed: true })).toMatchObject({ action: "confirm", nextRound: 2 });
    expect(evaluateConfirmation({ round: 3, changed: true })).toEqual({
      action: "stop",
      reason: "confirmation-churn",
      nextRound: null,
    });
  });

  test("computes a non-empty verdict-based gate mechanically", () => {
    expect(evaluateGate({}).ready).toBe(false);
    expect(evaluateGate({ threads: [{ id: "t", isResolved: true, verdict: "answered" }] }).ready).toBe(true);
    expect(evaluateGate({ comments: [{ id: "c", engaged: false, verdict: "addressed" }] })).toMatchObject({
      ready: false,
      triggerPending: ["c"],
    });
    expect(evaluateGate({ threads: [{ id: "t", isResolved: true, verdict: "rejected" }] }).verdictPending).toEqual(["t"]);
    expect(body()).toContain("scripts/evaluate-gate.mjs");
  });

  test("re-reviews triggers against code with shape-specific burden", () => {
    expect(existsSync(VERDICTS)).toBe(true);
    const text = `${body()}\n${read(VERDICTS)}`;
    for (const verdict of ["addressed", "answered", "pending", "rejected"]) expect(text).toContain(verdict);
    expect(text).toMatch(/plain comment.*requires a later push/is);
    expect(text).toMatch(/resolved thread.*very high\s+confidence and strong disagreement/is);
    expect(text).toMatch(/new\s+non-viewer reply.*whether resolved or not/is);
  });

  test("keeps verdict writes bounded and tied to the viewer's feedback", () => {
    const text = body();
    expect(text).toContain("resolveReviewThread");
    expect(text).toContain("addPullRequestReviewThreadReply");
    expect(text).toContain("THUMBS_UP");
    expect(text).toContain("THUMBS_DOWN");
    expect(text).toMatch(/Never repeat them without new\s+evidence/i);
    expect(text).toMatch(/Never resolve or rebut another\s+reviewer's thread/i);
    expect(text).toMatch(/standing\s+rejection produces no repeat write/i);
  });

  test("confirms auto-merge at arm and drift immediately before approval", () => {
    const text = body();
    expect(text).toMatch(/auto-merge enabled at arm requires explicit\s+confirmation before arming/i);
    expect(text).toMatch(/current head differs.*arm-time SHA/is);
    expect(text).toContain('scripts/evaluate-gate.mjs" confirmation');
  });

  test("requires an open ready gate at the exact confirmed head before approval", () => {
    const head = "a".repeat(40);
    const ready = {
      state: "OPEN" as const,
      currentHeadOid: head,
      confirmedHeadOid: head,
      threads: [{ id: "t", isResolved: true, verdict: "addressed" as const }],
      comments: [],
    };
    expect(requireApproval(ready)).toEqual({ approved: true, headOid: head, total: 1 });
    expect(() => requireApproval({ ...ready, state: "CLOSED" })).toThrow(/OPEN/);
    expect(() => requireApproval({ ...ready, confirmedHeadOid: "b".repeat(40) })).toThrow(/confirmed head/);
    expect(() => requireApproval({ ...ready, currentHeadOid: "invalid" })).toThrow(/valid/);
    expect(() => requireApproval({ ...ready, threads: [] })).toThrow(/non-empty/);
    expect(() => requireApproval({
      ...ready,
      threads: [{ id: "t", isResolved: false, verdict: "addressed" }],
    })).toThrow(/not ready/);
    const text = body();
    const guard = text.indexOf('scripts/evaluate-gate.mjs" approval');
    const approval = text.indexOf('gh pr review --approve "$PR_URL"');
    expect(guard).toBeGreaterThan(-1);
    expect(approval).toBeGreaterThan(guard);
  });

  test("casts one SHA-cited approval and never lands", () => {
    const text = body();
    expect(text).toContain('gh pr review --approve "$PR_URL" --body-file -');
    expect(text).toContain("<<'GH_APPROVE_EOF'");
    const template = text.match(/GH_APPROVE_EOF'\n([\s\S]*?)\nGH_APPROVE_EOF/)?.[1] ?? "";
    expect(template).toStartWith("Approved automatically:");
    expect(template).toContain("<approval-head-SHA>");
    expect(template).toContain("<arm-head-SHA>");
    expect(template).toContain("re-reviewed");
    expect(template).not.toContain("pr-watch-as-reviewer");
    expect(text).toMatch(/Never land the PR/i);
  });

  test("fails closed after compaction and reports every public write", () => {
    expect(existsSync(RECOVERY)).toBe(true);
    const text = `${body()}\n${read(RECOVERY)}`;
    expect(text).toMatch(/tracked-comment\s+list is unrecoverable, stop/i);
    expect(text).toMatch(/arm-time head.*never the current value/is);
    expect(text).toMatch(/every resolve\/rebuttal\/reaction write/i);
    expect(text).toContain("gh auth login");
    expect(text).toContain("gh auth refresh");
  });
});
