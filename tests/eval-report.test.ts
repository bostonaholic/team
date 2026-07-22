// tests/eval-report.test.ts
//
// L1 unit test for the PR-comment formatter (scripts/eval-report.ts). The body
// builder is a pure f(EvalResult[]) -> markdown, so it is fully testable here
// for free — no model calls, no GitHub API. Locks the `## PR Evals` marker that
// the workflow's upsert logic greps for.

import { describe, expect, test } from "bun:test";

import { buildReportBody, parseHistory, REPORT_MARKER } from "../scripts/eval-report";
import type { EvalResult, EvalTestEntry } from "./helpers/eval-store";

function entry(over: Partial<EvalTestEntry> = {}): EvalTestEntry {
  return {
    name: "planted-null-deref",
    suite: "code-reviewer-e2e",
    tier: "e2e",
    passed: true,
    duration_ms: 1000,
    cost_usd: 0.02,
    ...over,
  };
}

function result(over: Partial<EvalResult> = {}): EvalResult {
  const tests = over.tests ?? [entry()];
  const passed = tests.filter((t) => t.passed).length;
  return {
    schema_version: 1,
    version: "0.6.0",
    branch: "test",
    git_sha: "abc",
    timestamp: "2026-06-13T00:00:00.000Z",
    hostname: "ci",
    tier: "e2e",
    total_tests: tests.length,
    passed,
    failed: tests.length - passed,
    total_cost_usd: tests.reduce((s, t) => s + t.cost_usd, 0),
    total_duration_ms: tests.reduce((s, t) => s + t.duration_ms, 0),
    tests,
    ...over,
  };
}

describe("buildReportBody", () => {
  test("all-pass: PASS header, counts, cost, no Failures section", () => {
    const body = buildReportBody([result({ tests: [entry(), entry({ name: "b" })] })]);
    expect(body).toContain(`${REPORT_MARKER}: ✅ PASS`);
    expect(body).toContain("**2/2** tests passed");
    expect(body).toContain("$0.04");
    expect(body).toContain("| code-reviewer-e2e | 2/2 | ✅ |");
    expect(body).not.toContain("### Failures");
  });

  test("one fail: FAIL header and Failures section with name + exit_reason", () => {
    const body = buildReportBody([
      result({ tests: [entry(), entry({ name: "broke", passed: false, exit_reason: "timeout" })] }),
    ]);
    expect(body).toContain(`${REPORT_MARKER}: ❌ FAIL`);
    expect(body).toContain("**1/2** tests passed");
    expect(body).toContain("### Failures");
    expect(body).toContain("- ❌ broke: timeout");
  });

  test("missing exit_reason falls back to 'unknown'", () => {
    const body = buildReportBody([result({ tests: [entry({ passed: false })] })]);
    expect(body).toContain("- ❌ planted-null-deref: unknown");
  });

  test("empty input: No evals selected", () => {
    const body = buildReportBody([]);
    expect(body).toContain(`${REPORT_MARKER}: ⚠️ No evals selected`);
    expect(body).not.toContain("### Failures");
  });

  test("total_tests:0 result is treated as no evals", () => {
    const body = buildReportBody([result({ tests: [], total_tests: 0, passed: 0, failed: 0 })]);
    expect(body).toContain(`${REPORT_MARKER}: ⚠️ No evals selected`);
  });

  test("aggregates across multiple result files (per tier)", () => {
    const body = buildReportBody([
      result({ tier: "e2e", tests: [entry()] }),
      result({ tier: "llm-judge", tests: [entry({ name: "judge", suite: "code-reviewer-llm" })] }),
    ]);
    expect(body).toContain("**2/2** tests passed");
    expect(body).toContain("| code-reviewer-e2e | 1/1 |");
    expect(body).toContain("| code-reviewer-llm | 1/1 |");
  });

  test("every variant carries the upsert marker prefix", () => {
    for (const body of [
      buildReportBody([]),
      buildReportBody([result()]),
      buildReportBody([result({ tests: [entry({ passed: false })] })]),
    ]) {
      expect(body.startsWith(REPORT_MARKER)).toBe(true);
    }
  });
});

describe("buildReportBody run history (append across runs)", () => {
  const meta = { sha: "abc1234def5678", runUrl: "https://github.com/o/r/actions/runs/1" };

  test("first run: history table with one linked row and the run's cost as total", () => {
    const body = buildReportBody([result()], meta);
    expect(body).toContain("### Run history — **$0.02** total across 1 run");
    expect(body).toContain("| 1 | [abc1234](https://github.com/o/r/actions/runs/1) | ✅ 1/1 | $0.02 |");
  });

  test("second run appends a row and sums the cumulative cost", () => {
    const first = buildReportBody([result()], meta);
    const second = buildReportBody(
      [result({ tests: [entry({ name: "b", passed: false, exit_reason: "timeout", cost_usd: 0.03 })] })],
      { previousBody: first, sha: "9876543fedcba", runUrl: "https://github.com/o/r/actions/runs/2" },
    );
    expect(second).toContain("### Run history — **$0.05** total across 2 runs");
    expect(second).toContain("| 1 | [abc1234](https://github.com/o/r/actions/runs/1) | ✅ 1/1 | $0.02 |");
    expect(second).toContain("| 2 | [9876543](https://github.com/o/r/actions/runs/2) | ❌ 0/1 | $0.03 |");
    // Latest-run detail reflects only the new run, not the accumulated history.
    expect(second).toContain(`${REPORT_MARKER}: ❌ FAIL`);
    expect(second).toContain("**0/1** tests passed");
  });

  test("history round-trips through parseHistory", () => {
    const first = buildReportBody([result()], meta);
    const runs = parseHistory(first);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ sha: meta.sha, passed: 1, total: 1, cost_usd: 0.02 });
  });

  test("old-format previous body (no history marker) starts a fresh history", () => {
    const body = buildReportBody([result()], {
      previousBody: `${REPORT_MARKER}: ✅ PASS\n\nold overwrite-style comment`,
      ...meta,
    });
    expect(body).toContain("total across 1 run");
  });

  test("malformed embedded history is discarded, not fatal", () => {
    const body = buildReportBody([result()], {
      previousBody: "## PR Evals: ✅ PASS\n\n<!-- pr-evals-history:v1 {not json -->",
      ...meta,
    });
    expect(body).toContain("total across 1 run");
  });

  test("no-evals run keeps prior history and total without adding a row", () => {
    const first = buildReportBody([result()], meta);
    const body = buildReportBody([], { previousBody: first, sha: "9876543", runUrl: "" });
    expect(body).toContain(`${REPORT_MARKER}: ⚠️ No evals selected`);
    expect(body).toContain("### Run history — **$0.02** total across 1 run");
    expect(parseHistory(body)).toHaveLength(1);
  });

  test("no-evals run with no prior history renders no history section", () => {
    const body = buildReportBody([], meta);
    expect(body).not.toContain("### Run history");
    expect(body).not.toContain("pr-evals-history");
  });

  test("missing sha/runUrl renders a plain placeholder row", () => {
    const body = buildReportBody([result()]);
    expect(body).toContain("| 1 | — | ✅ 1/1 | $0.02 |");
  });
});
