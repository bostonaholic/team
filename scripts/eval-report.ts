#!/usr/bin/env bun
// scripts/eval-report.ts
//
// CLI: `bun run scripts/eval-report.ts <results-dir>`
// Formats one or more eval result JSONs (the schema written by
// tests/helpers/eval-store.ts) into a Markdown body for a PR comment, then
// prints it to stdout. Used by .github/workflows/evals.yml, which upserts the
// body as a single `## PR Evals` comment on the PR.
//
// The body builder is a pure function (buildReportBody) so it is unit-tested
// for free in tests/eval-report.test.ts. The CLI wrapper only reads files and
// always exits 0 — formatting must never fail the workflow. The run-evals job
// owns the real pass/fail signal via its own check status.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { EvalResult, EvalTestEntry } from "../tests/helpers/eval-store";

// The marker prefix the workflow greps for when deciding whether to update an
// existing comment or create a new one. MUST stay stable and in sync with the
// upsert logic in .github/workflows/evals.yml (locked by a tripwire test).
export const REPORT_MARKER = "## PR Evals";

function fmtCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/** The "no evals ran" body. A results JSON is always written even when diff
 *  selection skips every test (total_tests: 0), so both an empty input and an
 *  all-zero input land here. */
function noEvalsBody(): string {
  return (
    `${REPORT_MARKER}: ⚠️ No evals selected\n\n` +
    "No behavioral evals cover the files changed in this PR, so none ran. " +
    "Evals run automatically when a PR touches the files an eval depends on " +
    "(see `tests/helpers/touchfiles.ts`)."
  );
}

/** Build the Markdown PR-comment body from the collected eval result files.
 *  Pure: no I/O, no process state. */
export function buildReportBody(results: EvalResult[]): string {
  // Only results that actually ran a test carry signal; a skipped run still
  // writes a total_tests: 0 file (eval-store finalize()), which we ignore.
  const ran = results.filter((r) => r.total_tests > 0);
  if (ran.length === 0) return noEvalsBody();

  const tests: EvalTestEntry[] = ran.flatMap((r) => r.tests);
  const total = tests.length;
  const passed = tests.filter((t) => t.passed).length;
  const failed = total - passed;
  const cost = ran.reduce((sum, r) => sum + r.total_cost_usd, 0);

  const status = failed > 0 ? "❌ FAIL" : "✅ PASS";

  // One table row per suite, aggregating the tests that belong to it.
  const suites = [...new Set(tests.map((t) => t.suite))].sort();
  const rows = suites.map((suite) => {
    const group = tests.filter((t) => t.suite === suite);
    const sPassed = group.filter((t) => t.passed).length;
    const sCost = group.reduce((sum, t) => sum + t.cost_usd, 0);
    const icon = sPassed === group.length ? "✅" : "❌";
    return `| ${suite} | ${sPassed}/${group.length} | ${icon} | ${fmtCost(sCost)} |`;
  });

  let body =
    `${REPORT_MARKER}: ${status}\n\n` +
    `**${passed}/${total}** tests passed | **${fmtCost(cost)}** total cost\n\n` +
    "| Suite | Result | Status | Cost |\n" +
    "|-------|--------|--------|------|\n" +
    rows.join("\n");

  if (failed > 0) {
    const failLines = tests
      .filter((t) => !t.passed)
      .map((t) => `- ❌ ${t.name}: ${t.exit_reason ?? "unknown"}`)
      .join("\n");
    body += `\n\n### Failures\n${failLines}`;
  }

  return body;
}

/** Read and parse every *.json under dir (recursively), skipping any file that
 *  is not a valid eval result. */
export function readResultsDir(dir: string): EvalResult[] {
  if (!existsSync(dir)) return [];
  const out: EvalResult[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...readResultsDir(path));
      continue;
    }
    if (!entry.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as EvalResult;
      if (typeof parsed.total_tests === "number" && Array.isArray(parsed.tests)) {
        out.push(parsed);
      }
    } catch {
      // Malformed artifact — skip it rather than fail the report.
    }
  }
  return out;
}

if (import.meta.main) {
  const dir = process.argv[2] ?? "artifacts";
  process.stdout.write(buildReportBody(readResultsDir(dir)) + "\n");
  process.exit(0);
}
