#!/usr/bin/env bun
// scripts/eval-report.ts
//
// CLI: `bun run scripts/eval-report.ts <results-dir> [previous-body-file]`
// Formats one or more eval result JSONs (the schema written by
// tests/helpers/eval-store.ts) into a Markdown body for a PR comment, then
// prints it to stdout. Used by .github/workflows/pr-evals.yml, which upserts the
// body as a single `## PR Evals` comment on the PR.
//
// The comment is append-only across runs: prior runs are carried forward as a
// run-history table with a cumulative cost total, so the spend for the whole PR
// stays visible. The history rides inside the body itself as JSON in a hidden
// HTML comment (HISTORY_MARKER), parsed back out on the next run — no external
// state. Run metadata comes from EVAL_HEAD_SHA / EVAL_RUN_URL in the env.
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
// upsert logic in .github/workflows/pr-evals.yml (locked by a tripwire test).
export const REPORT_MARKER = "## PR Evals";

// Hidden carrier for the machine-readable run history. Must stay an HTML
// comment (invisible on GitHub) and must not contain `-->` in its payload —
// the JSON below (hex shas, URLs, numbers) never does.
const HISTORY_MARKER = "<!-- pr-evals-history:v1 ";

/** One completed eval run on this PR, as carried in the comment's history. */
export interface RunRecord {
  sha: string;
  run_url: string;
  passed: number;
  total: number;
  cost_usd: number;
}

/** Extract the run history embedded in a previous comment body. Returns []
 *  for a missing body, an old-format body without the marker, or malformed
 *  JSON — the history restarts rather than failing the report. */
export function parseHistory(body: string | undefined): RunRecord[] {
  if (!body) return [];
  const start = body.indexOf(HISTORY_MARKER);
  if (start === -1) return [];
  const end = body.indexOf("-->", start);
  if (end === -1) return [];
  try {
    const parsed = JSON.parse(body.slice(start + HISTORY_MARKER.length, end));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r): r is RunRecord => typeof r?.cost_usd === "number");
  } catch {
    return [];
  }
}

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

/** Render the accumulated runs as a Markdown table with a cumulative total. */
function historySection(runs: RunRecord[]): string {
  const total = runs.reduce((sum, r) => sum + r.cost_usd, 0);
  const rows = runs.map((r, i) => {
    const commit = r.sha ? r.sha.slice(0, 7) : "—";
    const label = r.run_url ? `[${commit}](${r.run_url})` : commit;
    const icon = r.passed === r.total ? "✅" : "❌";
    return `| ${i + 1} | ${label} | ${icon} ${r.passed}/${r.total} | ${fmtCost(r.cost_usd)} |`;
  });
  return (
    `### Run history — **${fmtCost(total)}** total across ${runs.length} run${runs.length === 1 ? "" : "s"}\n\n` +
    "| Run | Commit | Result | Cost |\n" +
    "|-----|--------|--------|------|\n" +
    rows.join("\n")
  );
}

export interface ReportOptions {
  /** Body of the existing `## PR Evals` comment, when one exists — its
   *  embedded history is carried forward instead of overwritten. */
  previousBody?: string;
  /** Head commit sha of the run being reported. */
  sha?: string;
  /** Workflow-run URL, used to link each history row. */
  runUrl?: string;
}

/** Build the Markdown PR-comment body from the collected eval result files,
 *  appending this run to the history carried in the previous comment body.
 *  Pure: no I/O, no process state. */
export function buildReportBody(results: EvalResult[], opts: ReportOptions = {}): string {
  const history = parseHistory(opts.previousBody);

  // Only results that actually ran a test carry signal; a skipped run still
  // writes a total_tests: 0 file (eval-store finalize()), which we ignore.
  // A no-evals run adds no history row (nothing ran, nothing spent) — prior
  // runs and the cost total still render so they are never lost.
  const ran = results.filter((r) => r.total_tests > 0);
  if (ran.length === 0) {
    let body = noEvalsBody();
    if (history.length > 0) {
      body += `\n\n${historySection(history)}`;
      body += `\n\n${HISTORY_MARKER}${JSON.stringify(history)} -->`;
    }
    return body;
  }

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
    `**${passed}/${total}** tests passed | **${fmtCost(cost)}** this run\n\n` +
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

  const runs: RunRecord[] = [
    ...history,
    {
      sha: opts.sha ?? "",
      run_url: opts.runUrl ?? "",
      passed,
      total,
      cost_usd: cost,
    },
  ];
  body += `\n\n${historySection(runs)}`;
  body += `\n\n${HISTORY_MARKER}${JSON.stringify(runs)} -->`;

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
  const previousBodyFile = process.argv[3];
  const previousBody =
    previousBodyFile && existsSync(previousBodyFile)
      ? readFileSync(previousBodyFile, "utf8")
      : undefined;
  process.stdout.write(
    buildReportBody(readResultsDir(dir), {
      previousBody,
      sha: process.env.EVAL_HEAD_SHA,
      runUrl: process.env.EVAL_RUN_URL,
    }) + "\n",
  );
  process.exit(0);
}
