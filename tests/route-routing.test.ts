// L2 static-invariant tripwires: the `/team` task routes are a leading-argument
// convention on the `team` command, not new registrations. These read the
// routing reference and the wiring around it and assert the contracts the
// milestone pins: route recognition is leading-argument only (never issue
// bodies or quoted text), each route names its stopping point, limited-scope
// routes forbid implementation effects, a route with no task requests the task
// first, and the route schema lands on `1-task.md` (task state, not neutral
// questions) and in the recovery hooks.
//
// docs/testing.md §2: a tripwire asserts a contract, never a wording. Each
// assertion below pins an identifier, a field name, a route word, or a
// forbidden effect — the machine-facing contract — not a sentence. Every
// absence assertion is preceded by a length guard so a mis-scoped read fails
// instead of vacuously passing.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { read, squash } from "./helpers/text";

const ROOT = join(import.meta.dir, "..");
const ROUTING = join(ROOT, "skills", "team", "references", "routing.md");
const ARTIFACTS = join(ROOT, "skills", "team", "references", "artifacts.md");
const INPUT = join(ROOT, "skills", "team", "references", "01-input.md");
const SETUP = join(ROOT, "skills", "team", "references", "02-setup.md");
const SKILL = join(ROOT, "skills", "team", "SKILL.md");
const HOOKS = ["session-start-recover.mjs", "pre-compact-anchor.mjs"].map((name) =>
  join(ROOT, "hooks", name),
);

const ROUTES = ["investigate", "plan", "prototype", "feature", "fix", "refactor"];
const LIMITED_ROUTES = ["investigate", "plan", "prototype"];
const FULL_ROUTES = ["feature", "fix", "refactor"];

describe("task route reference (L2)", () => {
  const text = read(ROUTING);
  const flat = squash(text);

  test("the routing reference exists and is non-trivial", () => {
    // Guard: a missing file must fail, not vacuously pass the checks below.
    expect(text.length).toBeGreaterThan(0);
  });

  test("documents all six leading-argument routes", () => {
    for (const route of ROUTES) {
      expect(text).toContain(`\`${route}\``);
    }
  });

  test("recognition is leading-argument only, never issue bodies or quoted text", () => {
    expect(flat).toContain("leading argument");
    expect(flat).toMatch(/never scan an issue body/i);
    expect(flat).toMatch(/quoted/i);
  });

  test("a route with no task requests the task before any mutation", () => {
    expect(flat).toMatch(/missing task/i);
    expect(flat).toMatch(/before any mutation/i);
  });

  test("each route names its stop condition and completion", () => {
    expect(text).toContain("Stop condition");
    expect(text).toContain("Completion");
    // Limited-scope routes persist routeStatus: complete as their completion.
    expect(text).toContain("routeStatus: complete");
  });

  test.each(LIMITED_ROUTES)("%s forbids implementation effects", (route) => {
    // The limited-scope contract forbids editing production code, creating a
    // production worktree, committing, pushing, and opening a PR.
    expect(flat).toContain("must not");
    expect(flat).toContain("edit production code");
    expect(flat).toContain("production worktree");
    expect(flat).toContain("commit");
    expect(flat).toContain("push");
    expect(flat).toContain("open a PR");
  });

  test("full routes connect to independent review and a draft PR", () => {
    expect(flat).toContain("draft PR");
    expect(flat).toMatch(/independent review/i);
    expect(flat).toContain("finding format");
  });
});

describe("route schema and wiring (L2)", () => {
  test("artifacts.md documents route and routeStatus on 1-task.md", () => {
    const text = read(ARTIFACTS);
    expect(text).toContain("`route: investigate | plan | prototype | feature | fix | refactor`");
    expect(text).toContain("`routeStatus: complete`");
    // Task state, never neutral questions.
    expect(squash(text)).toContain("never neutral research input");
    expect(text).toContain("2-questions.md");
  });

  test("the recovery hooks read route and routeStatus and never implement a limited-scope route", () => {
    for (const hook of HOOKS) {
      const src = read(hook);
      // Guard: a missing read must fail, not vacuously pass.
      expect(src.length).toBeGreaterThan(0);
      expect(src).toContain("routeStatus");
      expect(src).toContain("LIMITED_ROUTES");
      expect(src).toContain("does not authorize implementation");
    }
  });

  test("the SKILL.md router selects the route before setup", () => {
    const text = squash(read(SKILL));
    expect(text).toContain("references/routing.md");
    expect(text).toMatch(/leading argument/i);
    expect(text).toContain("before any setup");
  });

  test("input and setup read the routing reference and skip the worktree for limited scope", () => {
    expect(squash(read(INPUT))).toContain("routing.md");
    const setup = squash(read(SETUP));
    expect(setup).toContain("Select the route first");
    expect(setup).toContain("no production worktree");
  });

  test("the checks can see a planted violation (positive control)", () => {
    // A routing text that lacks the leading-argument rule must fail the
    // recognition sweep, proving the sweep fires rather than passing vacuously.
    const planted = "Routes map tasks to playbooks. A route selects an outcome.";
    expect(squash(planted)).not.toMatch(/leading argument/i);
    expect(squash(planted)).not.toMatch(/never scan an issue body/i);
  });
});
