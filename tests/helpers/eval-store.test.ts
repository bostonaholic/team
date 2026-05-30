// tests/helpers/eval-store.test.ts
//
// Unit tests for the persistence + comparison layer. All offline; $0.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  EvalCollector,
  assertNoBudgetRegressions,
  buildResultFilename,
  compareEvalResults,
  extractToolCounts,
  findBudgetRegressions,
  findPreviousRun,
  generateCommentary,
  SCHEMA_VERSION,
  type EvalResult,
  type EvalTestEntry,
} from "./eval-store";

let scratchDir = "";

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), "eval-store-test-"));
});
afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
  delete process.env.EVALS_BRANCH;
});

function mockTranscript(toolUseCount: number): unknown[] {
  const events: unknown[] = [];
  for (let i = 0; i < toolUseCount; i++) {
    events.push({
      type: "assistant",
      message: {
        content: [{ type: "tool_use", name: "Bash", input: { cmd: "ls" } }],
      },
    });
  }
  return events;
}

function entry(
  name: string,
  overrides: Partial<EvalTestEntry> = {},
): EvalTestEntry {
  return {
    name,
    suite: "test-suite",
    tier: "e2e",
    passed: true,
    duration_ms: 100,
    cost_usd: 0.01,
    ...overrides,
  };
}

describe("buildResultFilename", () => {
  test("encodes version/branch/tier/timestamp safely", () => {
    const f = buildResultFilename({
      version: "0.3.0",
      branch: "feature/foo bar",
      tier: "e2e",
      timestamp: "2026-05-29T12:00:00.000Z",
    });
    expect(f.endsWith(".json")).toBe(true);
    expect(f).toContain("e2e");
    expect(f).not.toContain(" ");
    expect(f).not.toContain("/");
  });
});

describe("EvalCollector", () => {
  test("writes incrementally and finalize is idempotent", async () => {
    const c = new EvalCollector("e2e", scratchDir);
    c.addTest(entry("alpha"));
    const filesAfterFirst = readdirSync(scratchDir).filter((f) => f.endsWith(".json"));
    expect(filesAfterFirst.length).toBe(1);

    c.addTest(entry("beta", { passed: false }));
    const path = await c.finalize();
    expect(existsSync(path)).toBe(true);

    const result = JSON.parse(readFileSync(path, "utf8")) as EvalResult;
    expect(result.schema_version).toBe(SCHEMA_VERSION);
    expect(result.total_tests).toBe(2);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.wall_clock_ms).toBeGreaterThanOrEqual(0);

    // Second finalize returns same path, no error.
    const again = await c.finalize();
    expect(again).toBe(path);
  });

  test("throws if addTest is called after finalize", async () => {
    const c = new EvalCollector("e2e", scratchDir);
    await c.finalize();
    expect(() => c.addTest(entry("z"))).toThrow(/after finalize/);
  });

  test("incremental writes contain a valid snapshot at every step", () => {
    const c = new EvalCollector("e2e", scratchDir);
    c.addTest(entry("one"));
    const path = readdirSync(scratchDir).filter((f) => f.endsWith(".json"))[0]!;
    const mid = JSON.parse(readFileSync(join(scratchDir, path), "utf8")) as EvalResult;
    expect(mid.total_tests).toBe(1);
    expect(mid.passed).toBe(1);
  });

  test("finalize populates budgetRegressions vs the previous run", async () => {
    process.env.EVALS_BRANCH = "budget-branch";
    // Seed a previous run with a low tool-call count.
    const prev: EvalResult = {
      schema_version: SCHEMA_VERSION,
      version: "0.0.0",
      branch: "budget-branch",
      git_sha: "x",
      timestamp: "2026-01-01T00:00:00.000Z",
      hostname: "h",
      tier: "e2e",
      total_tests: 1,
      passed: 1,
      failed: 0,
      total_cost_usd: 0.01,
      total_duration_ms: 100,
      tests: [entry("efficient-case", { transcript: mockTranscript(4) })],
    };
    writeFileSync(
      join(scratchDir, "0.0.0-budget-branch-e2e-2026-01-01T00-00-00.000Z.json"),
      JSON.stringify(prev),
      "utf8",
    );

    // Current run does the same work in 3× the tool calls.
    const c = new EvalCollector("e2e", scratchDir);
    c.addTest(entry("efficient-case", { transcript: mockTranscript(13) }));
    await c.finalize();

    expect(c.budgetRegressions.length).toBe(1);
    expect(c.budgetRegressions[0]?.name).toBe("efficient-case");
    expect(() => assertNoBudgetRegressions(c)).toThrow(/budget regression/);
  });

  test("assertNoBudgetRegressions is a no-op with no prior run", async () => {
    const c = new EvalCollector("e2e", scratchDir);
    c.addTest(entry("only-run", { transcript: mockTranscript(9) }));
    await c.finalize();
    expect(c.budgetRegressions.length).toBe(0);
    expect(() => assertNoBudgetRegressions(c)).not.toThrow();
  });
});

describe("findPreviousRun", () => {
  function writeRun(filename: string, partial: Partial<EvalResult> = {}): void {
    const result: EvalResult = {
      schema_version: SCHEMA_VERSION,
      version: "0.0.0",
      branch: "main",
      git_sha: "abc",
      timestamp: "2026-01-01T00:00:00.000Z",
      hostname: "h",
      tier: "e2e",
      total_tests: 0,
      passed: 0,
      failed: 0,
      total_cost_usd: 0,
      total_duration_ms: 0,
      tests: [],
      ...partial,
    };
    writeFileSync(join(scratchDir, filename), JSON.stringify(result), "utf8");
  }

  test("returns null when directory is empty", () => {
    expect(findPreviousRun("e2e", "main", scratchDir)).toBeNull();
  });

  test("prefers same-branch over older cross-branch", () => {
    writeRun("0.0.0-main-e2e-2026-01-01T00:00:00.000Z.json", { branch: "main", timestamp: "2026-01-01T00:00:00.000Z" });
    writeRun("0.0.0-feature-x-e2e-2026-02-01T00:00:00.000Z.json", { branch: "feature-x", timestamp: "2026-02-01T00:00:00.000Z" });
    const prev = findPreviousRun("e2e", "main", scratchDir);
    expect(prev?.result.branch).toBe("main");
  });

  test("falls back across branches when same-branch is absent", () => {
    writeRun("0.0.0-foo-e2e-2026-01-01T00:00:00.000Z.json", { branch: "foo" });
    writeRun("0.0.0-bar-e2e-2026-03-01T00:00:00.000Z.json", { branch: "bar", timestamp: "2026-03-01T00:00:00.000Z" });
    const prev = findPreviousRun("e2e", "main", scratchDir);
    expect(prev?.result.branch).toBe("bar"); // newest
  });

  test("filters by tier", () => {
    writeRun("0.0.0-main-e2e-2026-01-01T00:00:00.000Z.json", { tier: "e2e", branch: "main" });
    writeRun("0.0.0-main-llm-judge-2026-02-01T00:00:00.000Z.json", { tier: "llm-judge", branch: "main", timestamp: "2026-02-01T00:00:00.000Z" });
    const prev = findPreviousRun("llm-judge", "main", scratchDir);
    expect(prev?.result.tier).toBe("llm-judge");
  });

  test("excludePath skips a self-referenced file", () => {
    writeRun("0.0.0-main-e2e-2026-01-01T00:00:00.000Z.json", { branch: "main" });
    const self = join(scratchDir, "0.0.0-main-e2e-2026-01-01T00:00:00.000Z.json");
    const prev = findPreviousRun("e2e", "main", scratchDir, self);
    expect(prev).toBeNull();
  });
});

describe("compareEvalResults", () => {
  function makeResult(tests: EvalTestEntry[]): EvalResult {
    return {
      schema_version: SCHEMA_VERSION,
      version: "0.0.0",
      branch: "main",
      git_sha: "abc",
      timestamp: "2026-01-01T00:00:00.000Z",
      hostname: "h",
      tier: "e2e",
      total_tests: tests.length,
      passed: tests.filter((t) => t.passed).length,
      failed: tests.filter((t) => !t.passed).length,
      total_cost_usd: tests.reduce((s, t) => s + t.cost_usd, 0),
      total_duration_ms: tests.reduce((s, t) => s + t.duration_ms, 0),
      tests,
    };
  }

  test("classifies regressions, improvements, additions, removals", () => {
    const prev = makeResult([
      entry("stayed-passing"),
      entry("now-failing", { passed: true }),
      entry("now-passing", { passed: false }),
      entry("removed"),
    ]);
    const curr = makeResult([
      entry("stayed-passing"),
      entry("now-failing", { passed: false }),
      entry("now-passing", { passed: true }),
      entry("added"),
    ]);
    const cmp = compareEvalResults(prev, curr);
    expect(cmp.regressed).toBe(1);
    expect(cmp.improved).toBe(1);
    expect(cmp.unchanged).toBe(1);
    expect(cmp.added.map((t) => t.name)).toEqual(["added"]);
    expect(cmp.removed.map((t) => t.name)).toEqual(["removed"]);
  });

  test("computes total deltas", () => {
    const prev = makeResult([entry("x", { cost_usd: 0.10, duration_ms: 1000 })]);
    const curr = makeResult([entry("x", { cost_usd: 0.05, duration_ms: 500 })]);
    const cmp = compareEvalResults(prev, curr);
    expect(cmp.total_cost_delta).toBeCloseTo(-0.05);
    expect(cmp.total_duration_delta).toBe(-500);
  });
});

describe("extractToolCounts", () => {
  test("counts tools across an assistant transcript", () => {
    const transcript = [
      ...mockTranscript(2),
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Read", input: {} }],
        },
      },
    ];
    const counts = extractToolCounts(transcript);
    expect(counts.Bash).toBe(2);
    expect(counts.Read).toBe(1);
  });

  test("ignores non-array transcripts", () => {
    expect(extractToolCounts(undefined)).toEqual({});
    expect(extractToolCounts(null)).toEqual({});
    expect(extractToolCounts({ not: "an array" })).toEqual({});
  });
});

describe("findBudgetRegressions", () => {
  test("flags 3x growth above the floor", () => {
    const prev = entry("growth", { transcript: mockTranscript(4) });
    const curr = entry("growth", { transcript: mockTranscript(13) });
    const cmp = compareEvalResults(
      { schema_version: SCHEMA_VERSION, version: "0", branch: "main", git_sha: "x", timestamp: "t", hostname: "h", tier: "e2e", total_tests: 1, passed: 1, failed: 0, total_cost_usd: 0, total_duration_ms: 0, tests: [prev] },
      { schema_version: SCHEMA_VERSION, version: "0", branch: "main", git_sha: "x", timestamp: "t", hostname: "h", tier: "e2e", total_tests: 1, passed: 1, failed: 0, total_cost_usd: 0, total_duration_ms: 0, tests: [curr] },
    );
    const regressions = findBudgetRegressions(cmp);
    expect(regressions.length).toBe(1);
    expect(regressions[0]?.reason).toContain("tool calls");
  });

  test("does NOT flag small prior counts even on large multipliers (floor)", () => {
    const prev = entry("tiny", { transcript: mockTranscript(1) });
    const curr = entry("tiny", { transcript: mockTranscript(5) });
    const cmp = compareEvalResults(
      { schema_version: SCHEMA_VERSION, version: "0", branch: "main", git_sha: "x", timestamp: "t", hostname: "h", tier: "e2e", total_tests: 1, passed: 1, failed: 0, total_cost_usd: 0, total_duration_ms: 0, tests: [prev] },
      { schema_version: SCHEMA_VERSION, version: "0", branch: "main", git_sha: "x", timestamp: "t", hostname: "h", tier: "e2e", total_tests: 1, passed: 1, failed: 0, total_cost_usd: 0, total_duration_ms: 0, tests: [curr] },
    );
    const regressions = findBudgetRegressions(cmp);
    expect(regressions.length).toBe(0);
  });
});

describe("generateCommentary", () => {
  test("names regressions first", () => {
    const prev: EvalResult = {
      schema_version: SCHEMA_VERSION, version: "0", branch: "main", git_sha: "x", timestamp: "t", hostname: "h",
      tier: "e2e", total_tests: 2, passed: 1, failed: 1, total_cost_usd: 0, total_duration_ms: 0,
      tests: [entry("a", { passed: true }), entry("b", { passed: false })],
    };
    const curr: EvalResult = {
      ...prev,
      tests: [entry("a", { passed: false }), entry("b", { passed: true })],
    };
    const cmp = compareEvalResults(prev, curr);
    const text = generateCommentary(cmp);
    const regIdx = text.indexOf("REGRESSIONS");
    const impIdx = text.indexOf("IMPROVEMENTS");
    expect(regIdx).toBeGreaterThanOrEqual(0);
    expect(impIdx).toBeGreaterThan(regIdx);
  });
});
