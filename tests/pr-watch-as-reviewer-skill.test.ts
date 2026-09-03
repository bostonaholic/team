import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import { evaluateGate, evaluatePoll, parseTarget } from "../skills/pr-watch-as-reviewer/scripts/evaluate-gate.mjs";

const ROOT = process.cwd();
const PATH = join(ROOT, "skills", "pr-watch-as-reviewer", "SKILL.md");
const VERDICTS = join(ROOT, "skills", "pr-watch-as-reviewer", "references", "verdicts.md");
const RECOVERY = join(ROOT, "skills", "pr-watch-as-reviewer", "references", "recovery.md");
const EVALUATE_GATE = join(ROOT, "skills", "pr-watch-as-reviewer", "scripts", "evaluate-gate.mjs");
const body = () => (existsSync(PATH) ? read(PATH) : "");
const flat = (value: string) => value.replace(/\s+/g, " ");
const HEAD_OID = "a".repeat(40);

describe("pr-watch-as-reviewer public contract", () => {
  test("is explicit-only because approval can transitively merge", () => {
    const fm = frontmatter(body());
    expect(fm).toMatch(/^name:\s*pr-watch-as-reviewer$/m);
    expect(fm).toMatch(/^effort:\s*medium$/m);
    expect(fm).toMatch(/^argument-hint:.*pr-number-or-url/m);
    expect(fm).toMatch(/^disable-model-invocation:\s*true$/m);
    const normalized = flat(fm);
    expect(normalized).toContain("approve the PR when my comments are resolved");
    expect(normalized).toContain("watch and approve");
    expect(normalized).toContain("/pr-watch-as-reviewer");
  });

  test("validates arguments before a projected canonical PR read", () => {
    const text = body();
    expect(parseTarget("")).toEqual({ target: null, number: null, repository: null });
    expect(parseTarget("27")).toMatchObject({ number: 27, repository: null });
    expect(parseTarget("https://github.com/acme/widgets/pull/28")).toMatchObject({
      number: 28,
      repository: "acme/widgets",
    });
    for (const target of ["0", "9007199254740992", "27; touch x", "https://example.com/acme/widgets/pull/28"]) {
      expect(() => parseTarget(target)).toThrow();
    }
    expect(text).toContain('scripts/evaluate-gate.mjs" target');
    expect(text).toContain('gh pr view "$ARG_NUMBER" --repo "$ARG_REPOSITORY"');
    expect(text).toContain("FIELDS=url,number,state,isDraft,author,autoMergeRequest,headRefOid,latestReviews");
    expect(text).toContain("latestReviewStates: [.latestReviews[] | {login: .author.login, state}]");
    expect(text).toMatch(/Bind .* only from returned `url`/s);
  });

  test("reads raw targets only from stdin without executing them", () => {
    const directory = mkdtempSync(join(tmpdir(), "team-reviewer-watch-target-"));
    const marker = join(directory, "injected");
    try {
      const valid = spawnSync(process.execPath, [EVALUATE_GATE, "target"], {
        input: "27",
        encoding: "utf8",
      });
      expect(valid.status).toBe(0);
      expect(JSON.parse(valid.stdout)).toMatchObject({ number: 27 });

      const injected = spawnSync(process.execPath, [EVALUATE_GATE, "target"], {
        input: `27; touch ${marker}`,
        encoding: "utf8",
      });
      expect(injected.status).toBe(2);
      expect(existsSync(marker)).toBe(false);
      expect(body()).not.toContain('case "$ARGUMENTS"');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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
    expect(text).toMatch(/three consecutive failures stop/i);
    expect(flat(text)).toContain("paginationComplete, state, headRefOid, gateReady");
    expect(evaluatePoll({
      cycle: 0,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "OPEN",
      headRefOid: HEAD_OID,
      gateReady: false,
    }))
      .toMatchObject({ action: "continue", nextCycle: 1 });
    expect(evaluatePoll({ cycle: 12, consecutiveFailures: 2, fetchOk: false, paginationComplete: false, gateReady: false }))
      .toMatchObject({ action: "stop", reason: "poll-failures", failures: 3 });
    expect(evaluatePoll({
      cycle: 48,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "OPEN",
      headRefOid: HEAD_OID,
      gateReady: false,
    }))
      .toMatchObject({ action: "stop", reason: "timeout" });
    expect(evaluatePoll({
      cycle: 48,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "OPEN",
      headRefOid: HEAD_OID,
      gateReady: true,
    })).toMatchObject({ action: "evaluate", reason: "gate-ready", headRefOid: HEAD_OID });
    expect(() => evaluatePoll({ cycle: 49, consecutiveFailures: 0, fetchOk: true, paginationComplete: true, gateReady: false }))
      .toThrow(/0 through 48/);
    expect(text).toContain('scripts/evaluate-gate.mjs" poll');
  });

  test("requires an open PR and valid final head before evaluation", () => {
    expect(evaluatePoll({
      cycle: 2,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "OPEN",
      headRefOid: HEAD_OID,
      gateReady: true,
    })).toEqual({
      action: "evaluate",
      reason: "gate-ready",
      failures: 0,
      nextCycle: null,
      headRefOid: HEAD_OID,
    });
    expect(evaluatePoll({
      cycle: 2,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "CLOSED",
      headRefOid: HEAD_OID,
      gateReady: true,
    })).toMatchObject({ action: "stop", reason: "closed", headRefOid: HEAD_OID });
    expect(evaluatePoll({
      cycle: 2,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "MERGED",
      headRefOid: HEAD_OID,
      gateReady: true,
    })).toMatchObject({ action: "stop", reason: "merged", headRefOid: HEAD_OID });
    expect(() => evaluatePoll({
      cycle: 2,
      consecutiveFailures: 0,
      fetchOk: true,
      paginationComplete: true,
      state: "OPEN",
      headRefOid: "not-an-oid",
      gateReady: true,
    })).toThrow(/invalid PR head OID/);
    expect(flat(body())).toContain("final helper transition to be `evaluate` with reason `gate-ready`");
    expect(flat(body())).toContain("Use its returned `headRefOid`");
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
    const result = spawnSync(process.execPath, [EVALUATE_GATE, "gate"], {
      input: JSON.stringify({ threads: [{ id: "t", isResolved: true, verdict: "answered" }] }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ready: true });
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
    expect(text).toMatch(/poll and re-evaluate every gate.*After three consecutive/s);
    expect(text).toMatch(/no stops without approval/i);
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
