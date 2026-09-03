import { describe, expect, test } from "bun:test";

import { parseInput } from "../skills/groom-backlog/scripts/parse-input.mjs";
import { compareChecks } from "../skills/pr-rebase/scripts/compare-checks.mjs";
import { evaluateGate } from "../skills/pr-watch-as-reviewer/scripts/evaluate-gate.mjs";

describe("groom-backlog input parser", () => {
  test("selects board or promotion mode without evaluating text", () => {
    expect(parseInput("")).toEqual({ ok: true, mode: "board", project: null, promote: null });
    expect(parseInput("5 --promote 41")).toEqual({
      ok: true,
      mode: "promotion",
      project: { number: 5, owner: null, kind: null },
      promote: 41,
    });
    expect(parseInput("https://github.com/users/octo/projects/7")).toEqual({
      ok: true,
      mode: "board",
      project: { number: 7, owner: "octo", kind: "users" },
      promote: null,
    });
  });

  test("rejects ambiguous or malformed input", () => {
    expect(parseInput("5 6").ok).toBe(false);
    expect(parseInput("--promote nope").ok).toBe(false);
    expect(parseInput("--promote 1 --promote 2").ok).toBe(false);
    expect(parseInput("$(touch nope)").ok).toBe(false);
  });
});

describe("pr-rebase check comparison", () => {
  test("blocks only a known pass-to-fail regression", () => {
    const result = compareChecks(
      [{ id: "unit", status: "PASS" }, { id: "lint", status: "FAIL" }],
      [{ id: "unit", status: "FAIL" }, { id: "lint", status: "PASS" }],
    );
    expect(result.blocksPublish).toBe(true);
    expect(result.rows.map((row) => row.outcome)).toEqual(["fixed", "regression"]);
  });

  test("preserves unknown and missing checks as unverified", () => {
    const result = compareChecks([{ id: "unit", status: "PASS" }], []);
    expect(result.blocksPublish).toBe(false);
    expect(result.rows[0]).toEqual({
      id: "unit",
      before: "PASS",
      after: "UNKNOWN",
      outcome: "unverified",
    });
  });
});

describe("reviewer-watch approval gate", () => {
  test("requires a non-empty set, satisfied triggers, and passing verdicts", () => {
    expect(evaluateGate({}).ready).toBe(false);
    expect(evaluateGate({
      threads: [{ id: "t1", isResolved: true, verdict: "addressed" }],
      comments: [{ id: "c1", engaged: true, verdict: "answered" }],
    }).ready).toBe(true);
    expect(evaluateGate({
      threads: [{ id: "t1", isResolved: true, verdict: "pending" }],
    })).toMatchObject({ ready: false, triggerPending: [], verdictPending: ["t1"] });
  });

  test("keeps thread and comment trigger failures visible by id", () => {
    expect(evaluateGate({
      threads: [{ id: "t1", isResolved: false, verdict: "addressed" }],
      comments: [{ id: "c1", engaged: false, verdict: "answered" }],
    }).triggerPending).toEqual(["t1", "c1"]);
  });
});
