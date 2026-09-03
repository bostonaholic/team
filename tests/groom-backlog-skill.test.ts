import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import { parseInput } from "../skills/groom-backlog/scripts/parse-input.mjs";
import { evaluateRetry } from "../skills/groom-backlog/scripts/retry.mjs";

const ROOT = process.cwd();
const PATH = join(ROOT, "skills", "groom-backlog", "SKILL.md");
const PROMOTION = join(ROOT, "skills", "groom-backlog", "references", "promotion.md");
const RECIPES = join(ROOT, "skills", "groom-backlog", "references", "github-recipes.md");
const body = () => (existsSync(PATH) ? read(PATH) : "");
const flat = (value: string) => value.replace(/\s+/g, " ");

describe("groom-backlog public contract", () => {
  test("requires explicit scan or promote invocation", () => {
    const fm = frontmatter(body());
    expect(fm).toMatch(/^name:\s*groom-backlog$/m);
    expect(fm).toMatch(/^effort:\s*high$/m);
    expect(fm).toMatch(/^argument-hint:\s*"scan .* \| promote <issue-number> /m);
    expect(fm).toMatch(/^disable-model-invocation:\s*true$/m);
    const normalized = flat(fm);
    for (const trigger of ["groom the backlog", "groom the board", "clean up the backlog", "shape the backlog", "place these issues under milestones", "/groom-backlog"]) {
      expect(normalized).toContain(trigger);
    }
    expect(body()).toContain("scripts/parse-input.mjs");
  });

  test("input parser rejects ambiguity and dispatches modes", () => {
    expect(parseInput("scan 7")).toMatchObject({ ok: true, mode: "scan", promote: null });
    expect(parseInput("promote 42")).toMatchObject({ ok: true, mode: "promote", promote: 42 });
    expect(parseInput("").ok).toBe(false);
    expect(parseInput("7").ok).toBe(false);
    expect(parseInput("scan 7 8").ok).toBe(false);
    expect(parseInput("promote x").ok).toBe(false);
  });

  test("loads complete board, grouping, issues, links, and comments before judgment", () => {
    const text = body();
    const board = text.indexOf("gh project item-list");
    const milestones = text.indexOf("milestones?state=all&per_page=100", board);
    const issues = text.indexOf("gh issue list", milestones);
    const inventory = text.indexOf("gap-inventory.md", issues);
    expect(board).toBeGreaterThan(-1);
    expect(milestones).toBeGreaterThan(board);
    expect(issues).toBeGreaterThan(milestones);
    expect(inventory).toBeGreaterThan(issues);
    expect(text).toContain("--limit 10000");
    expect(text).toContain("totalCount");
    expect(text).toContain("unloaded-links.txt");
    expect(text).toContain("unloaded-threads.txt");
    expect(text).toMatch(/partial .* load stops/is);
  });

  test("verifies a fixed candidate set and ranks only verified work", () => {
    const text = body();
    const verify = text.indexOf("### 2. Inventory and verify");
    const grouping = text.indexOf("### 3. Group and order");
    expect(verify).toBeGreaterThan(-1);
    expect(grouping).toBeGreaterThan(verify);
    for (const verdict of ["claims hold", "partially stale", "premise evaporated"]) {
      expect(text).toContain(verdict);
    }
    for (const tier of ["shipped-behavior contradictions", "harness reliability", "high-leverage improvements", "strategic unblockers", "smaller verified scope"]) {
      expect(text).toContain(tier);
    }
    expect(text).toContain("git rev-parse --show-toplevel");
    expect(text).toContain("git remote get-url origin");
  });

  test("keeps dependency direction, cycle, and approval constraints", () => {
    const text = body();
    expect(text).toMatch(/A is\s+blocked by B only when A cannot finish before B lands/i);
    expect(text).toMatch(/Never propose self-links,\s+cycles/is);
    expect(text).toMatch(/Each proposed link names both endpoints and evidence/i);
    expect(text).toMatch(/class present:.*dependency\s+links/is);
  });

  test("writes a durable plan before class and per-item approvals", () => {
    const text = body();
    const plan = text.indexOf('$RUN_DIR/plan.md');
    const ask = text.indexOf("Ask one structured question", plan);
    const execute = text.indexOf("### 5. Execute approved steps", ask);
    expect(plan).toBeGreaterThan(-1);
    expect(ask).toBeGreaterThan(plan);
    expect(execute).toBeGreaterThan(ask);
    expect(text).toMatch(/Every new issue and every closure gets its\s+own question/i);
    expect(text).toMatch(/Nothing on the tracker changes before an answer/i);
    expect(text).toMatch(/partial answer.*answered subset/is);
  });

  test("executes in dependency order with pre-images and re-reads", () => {
    const text = body();
    expect(text).toContain("constructs → descriptions/dates → placement → rewrites → state/priority/labels → new issues → closures → links");
    expect(text).toContain("original-body-<n>.md");
    expect(text).toMatch(/Immediately before each write, re-read/i);
    expect(text).toMatch(/any new comment.*skips both comment and close/is);
  });

  test("bounds transient write retries with deterministic backoff", () => {
    expect(evaluateRetry({ attempt: 1, retryable: true })).toEqual({
      action: "retry", reason: "transient", nextAttempt: 2, delaySeconds: 2,
    });
    expect(evaluateRetry({ attempt: 2, retryable: true })).toEqual({
      action: "retry", reason: "transient", nextAttempt: 3, delaySeconds: 4,
    });
    expect(evaluateRetry({ attempt: 3, retryable: true })).toEqual({
      action: "stop", reason: "retry-limit", nextAttempt: null, delaySeconds: null,
    });
    expect(evaluateRetry({ attempt: 1, retryable: false })).toMatchObject({ action: "stop", reason: "non-retryable" });
    expect(() => evaluateRetry({ attempt: 4, retryable: true })).toThrow(/1 through 3/);
    expect(body()).toContain('scripts/retry.mjs');
    expect(body()).toMatch(/at most three attempts/i);
  });

  test("keeps irreversible issue and dependency commands visible", () => {
    const text = body();
    const create = text.indexOf("gh issue create");
    const close = text.indexOf("gh issue close");
    const link = text.indexOf("dependencies/blocked_by");
    expect(create).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(-1);
    expect(link).toBeGreaterThan(-1);
    expect(text).toContain('--reason "not planned"');
    expect(text).toContain("closure-evidence-$N.md");
    expect(text).toContain('-F issue_id="$BLOCKER_ID"');
  });

  test("passes prose by file and uses additive labels", () => {
    const text = `${body()}\n${read(RECIPES)}`;
    expect(existsSync(RECIPES)).toBe(true);
    for (const route of ["--body-file", "--input", "-F body=@"]) expect(text).toContain(route);
    expect(text).not.toMatch(/--body\s+"/);
    expect(text).toContain("--add-label");
  });

  test("promotion is narrow, blocked-aware, capped, and bug-safe", () => {
    expect(existsSync(PROMOTION)).toBe(true);
    const promotion = read(PROMOTION);
    expect(promotion).toMatch(/Load only the named board\s+item/i);
    expect(promotion).toMatch(/WIP limit is 5/i);
    expect(promotion).toMatch(/open .* blocker omits the move/is);
    expect(promotion).toMatch(/bug.*never promote/is);
    expect(promotion).toContain("premise evaporated");
  });

  test("never closes decision work or mutates another user's in-flight item", () => {
    const text = body();
    expect(text).toMatch(/Never close a decision, investigation, spike/i);
    expect(text).toMatch(/Do not alter priority, assignee, or state on\s+another user's in-flight item/i);
    expect(text).toMatch(/Zero issues.*nothing to groom/is);
  });
});
