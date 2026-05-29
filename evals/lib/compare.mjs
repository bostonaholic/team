// evals/lib/compare.mjs
//
// Compare two run directories or auto-find the previous same-branch run.
// Ports findPreviousRun, compareEvalResults, formatComparison, and
// generateCommentary from gstack/test/helpers/eval-store.ts (:177, :220,
// :323, :437). The TS-to-mjs adaptation drops typing but keeps the
// algorithm verbatim.
//
// CLI shape:
//   node compare.mjs <run-a> <run-b>
//       Diff the two result directories. Output lists regressions
//       first, then improvements, then additions/removals.
//
//   node compare.mjs --find-previous --branch=<name>
//       Print the most recent prior run directory (under
//       EVALS_RESULTS_ROOT), preferring same-branch matches.
//
//   node compare.mjs --auto
//       Used by the runner to append a "vs previous: …" tail.

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { basename, join } from "node:path";

import { SCHEMA_VERSION } from "./result-store.mjs";

// Directory name convention from slice 1's result-store:
//   <schema_version>-<branch>-<tier>-<timestamp>
// Branch can itself contain dashes; we parse positionally.
// We accept a trailing dash + case name (from filename buildResultFilename)
// but the run *directories* are not named that way — they're named by
// the user-supplied runId, which can be arbitrary. For findPreviousRun
// we only match dir names that conform to the convention. Anything else
// is silently skipped (a "run-2026-…" dir from slice 1 is fine if there
// are no convention-conformant matches, but we should still consider it).
const RUN_DIR_PATTERN = /^(\d+)-(.+)-([A-Za-z0-9_-]+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$/;

function parseRunDirName(name) {
  const m = RUN_DIR_PATTERN.exec(name);
  if (!m) return null;
  return {
    version: parseInt(m[1], 10),
    branch: m[2],
    tier: m[3],
    timestamp: m[4],
  };
}

function resultsRoot() {
  return process.env.EVALS_RESULTS_ROOT || join(process.cwd(), "evals/results");
}

// ---------------------------------------------------------------------------
// findPreviousRun: returns the directory name (not full path) of the
// preferred match, or null when none exists.
// ---------------------------------------------------------------------------

export function findPreviousRun({ resultsRoot: root, branch, excludeRunId } = {}) {
  const r = root || resultsRoot();
  if (!existsSync(r)) return null;
  const entries = readdirSync(r, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !excludeRunId || name !== excludeRunId);
  const parsed = entries
    .map((name) => ({ name, ...parseRunDirName(name) }))
    .filter((p) => p.version !== undefined && p.version !== null);
  if (parsed.length === 0) return null;

  // Sort timestamp desc.
  parsed.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));

  if (branch) {
    const sameBranch = parsed.find((p) => p.branch === branch);
    if (sameBranch) return sameBranch.name;
  }
  // Fall back to most recent on any branch.
  return parsed[0].name;
}

// ---------------------------------------------------------------------------
// Load all case results in a run directory. Skip _partial-*.json.
// ---------------------------------------------------------------------------

function loadRunResults(runDir) {
  if (!existsSync(runDir)) return [];
  const files = readdirSync(runDir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_partial-"));
  const results = [];
  for (const f of files) {
    const path = join(runDir, f);
    try {
      const r = JSON.parse(readFileSync(path, "utf8"));
      results.push(r);
    } catch {
      // Skip unparseable files; they don't participate in comparison.
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// compareEvalResults: match cases by `case` field; for each case, match
// criteria by `name`. Returns four lists keyed by criterion name +
// case name, plus per-case verdict deltas.
// ---------------------------------------------------------------------------

export function compareEvalResults(runA, runB) {
  if (runA.length > 0 && runB.length > 0) {
    const va = runA[0].schema_version;
    const vb = runB[0].schema_version;
    if (va !== undefined && vb !== undefined && va !== vb) {
      throw new Error(
        `cannot compare across schema versions (run-a=${va}, run-b=${vb}, runner=${SCHEMA_VERSION})`,
      );
    }
  }

  const byCaseA = new Map(runA.map((r) => [r.case, r]));
  const byCaseB = new Map(runB.map((r) => [r.case, r]));

  const regressed = [];
  const improved = [];
  const added = [];
  const removed = [];
  const verdictChanges = [];

  const allCases = new Set([...byCaseA.keys(), ...byCaseB.keys()]);
  for (const caseName of allCases) {
    const a = byCaseA.get(caseName);
    const b = byCaseB.get(caseName);

    if (a && b && a.verdict !== b.verdict) {
      verdictChanges.push({
        case: caseName,
        from: a.verdict,
        to: b.verdict,
      });
    }

    const aCrit = new Map(
      (a?.criteria || []).map((c) => [c.name, c]),
    );
    const bCrit = new Map(
      (b?.criteria || []).map((c) => [c.name, c]),
    );
    const names = new Set([...aCrit.keys(), ...bCrit.keys()]);
    for (const name of names) {
      const ca = aCrit.get(name);
      const cb = bCrit.get(name);
      if (ca && !cb) {
        removed.push({ case: caseName, name, fromScore: ca.score });
      } else if (!ca && cb) {
        added.push({ case: caseName, name, toScore: cb.score });
      } else if (ca && cb) {
        const delta = (cb.score ?? 0) - (ca.score ?? 0);
        if (delta < 0) {
          regressed.push({
            case: caseName,
            name,
            fromScore: ca.score,
            toScore: cb.score,
            delta,
          });
        } else if (delta > 0) {
          improved.push({
            case: caseName,
            name,
            fromScore: ca.score,
            toScore: cb.score,
            delta,
          });
        }
      }
    }
  }

  return { regressed, improved, added, removed, verdictChanges };
}

// ---------------------------------------------------------------------------
// formatComparison: produce the textual report. Regressions FIRST (the
// load-bearing acceptance criterion of slice 4), then improvements, then
// added, then removed, then verdict deltas.
// ---------------------------------------------------------------------------

export function formatComparison(diff) {
  const lines = [];
  lines.push("comparison: vs previous");
  lines.push("");

  if (diff.regressed.length > 0) {
    lines.push("REGRESSIONS:");
    for (const r of diff.regressed) {
      lines.push(
        `  ${r.case}/${r.name}: ${r.fromScore} -> ${r.toScore} (delta ${r.delta})`,
      );
    }
    lines.push("");
  }

  if (diff.improved.length > 0) {
    lines.push("IMPROVEMENTS:");
    for (const r of diff.improved) {
      lines.push(
        `  ${r.case}/${r.name}: ${r.fromScore} -> ${r.toScore} (delta +${r.delta})`,
      );
    }
    lines.push("");
  }

  if (diff.added.length > 0) {
    lines.push("ADDED CRITERIA:");
    for (const r of diff.added) {
      lines.push(`  ${r.case}/${r.name}: ${r.toScore} (new)`);
    }
    lines.push("");
  }

  if (diff.removed.length > 0) {
    lines.push("REMOVED CRITERIA:");
    for (const r of diff.removed) {
      lines.push(`  ${r.case}/${r.name}: ${r.fromScore} (was)`);
    }
    lines.push("");
  }

  if (diff.verdictChanges.length > 0) {
    lines.push("VERDICT CHANGES:");
    for (const v of diff.verdictChanges) {
      lines.push(`  ${v.case}: ${v.from} -> ${v.to}`);
    }
    lines.push("");
  }

  if (
    diff.regressed.length === 0 &&
    diff.improved.length === 0 &&
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.verdictChanges.length === 0
  ) {
    lines.push("no changes vs previous run.");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Commentary heuristics ported from gstack's generateCommentary:437.
// Surface deltas >= 20% explicitly.
// ---------------------------------------------------------------------------

export function generateCommentary(diff) {
  const notes = [];
  for (const r of diff.regressed) {
    const baseline = Math.abs(r.fromScore || 1);
    const pct = Math.abs(r.delta) / baseline;
    if (pct >= 0.2) {
      notes.push(
        `regression >=20%: ${r.case}/${r.name} dropped ${(pct * 100).toFixed(0)}%`,
      );
    }
  }
  for (const r of diff.improved) {
    const baseline = Math.abs(r.fromScore || 1);
    const pct = Math.abs(r.delta) / baseline;
    if (pct >= 0.2) {
      notes.push(
        `improvement >=20%: ${r.case}/${r.name} rose ${(pct * 100).toFixed(0)}%`,
      );
    }
  }
  return notes.join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function runCli(argv) {
  if (argv.includes("--find-previous")) {
    let branch = null;
    for (const a of argv) {
      const m = /^--branch=(.+)$/.exec(a);
      if (m) branch = m[1];
    }
    const root = resultsRoot();
    const prev = findPreviousRun({ resultsRoot: root, branch });
    if (prev) {
      process.stdout.write(prev + "\n");
    }
    return 0;
  }

  if (argv.includes("--auto")) {
    // Used by the runner; resolved against EVALS_RESULTS_ROOT.
    return 0;
  }

  // Two-dir compare.
  const positional = argv.filter((a) => !a.startsWith("--"));
  if (positional.length !== 2) {
    process.stderr.write(
      "usage: node evals/lib/compare.mjs <run-a-dir> <run-b-dir>\n",
    );
    return 2;
  }
  const [a, b] = positional;
  if (!existsSync(a) || !existsSync(b)) {
    process.stderr.write(`compare: missing directory (${a} or ${b})\n`);
    return 2;
  }
  const runA = loadRunResults(a);
  const runB = loadRunResults(b);
  let diff;
  try {
    diff = compareEvalResults(runA, runB);
  } catch (err) {
    process.stderr.write(`compare: ${err.message}\n`);
    return 2;
  }
  process.stdout.write(formatComparison(diff) + "\n");
  const commentary = generateCommentary(diff);
  if (commentary) {
    process.stdout.write("\n" + commentary + "\n");
  }
  return diff.regressed.length > 0 ? 2 : 0;
}

if (process.argv[1] && process.argv[1].endsWith("compare.mjs")) {
  const code = runCli(process.argv.slice(2));
  process.exit(code);
}
