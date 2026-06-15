// tests/eval-report.test.ts
//
// L1 unit test for the PR-comment formatter (scripts/eval-report.ts). The body
// builder is a pure f(EvalResult[]) -> markdown, so it is fully testable here
// for free — no model calls, no GitHub API. Locks the `## PR Evals` marker that
// the workflow's upsert logic greps for.

import { describe, expect, test } from "bun:test";

import { buildReportBody, REPORT_MARKER } from "../scripts/eval-report";
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
