// tests/helpers/eval-store.ts
//
// Persist eval results to disk and compare against the previous run on the
// same branch+tier. Storage path is in-repo at evals/results/ so CI uploads
// the directory as a 90-day artifact.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";

export const SCHEMA_VERSION = 1 as const;

export type Tier = "e2e" | "llm-judge";

export interface EvalTestEntry {
  name: string;
  suite: string;
  tier: Tier;
  passed: boolean;
  duration_ms: number;
  cost_usd: number;
  transcript?: unknown[];
  judge_scores?: Record<string, number>;
  exit_reason?: string;
  model?: string;
  first_response_ms?: number;
  max_inter_turn_ms?: number;
}

export interface EvalResult {
  schema_version: typeof SCHEMA_VERSION;
  version: string;
  branch: string;
  git_sha: string;
  timestamp: string;
  hostname: string;
  tier: Tier;
  total_tests: number;
  passed: number;
  failed: number;
  total_cost_usd: number;
  total_duration_ms: number;
  wall_clock_ms?: number;
  tests: EvalTestEntry[];
}

// ---------------------------------------------------------------------------
// Storage path resolution.
// ---------------------------------------------------------------------------

function repoRoot(): string {
  try {
    const out = execFileSync(
      "git",
      ["rev-parse", "--show-toplevel"],
      { encoding: "utf8" },
    ).trim();
    if (out.length > 0) return out;
  } catch {
    // Fall through.
  }
  return process.cwd();
}

export function defaultEvalDir(): string {
  const override = process.env.EVALS_RESULTS_ROOT;
  if (override !== undefined && override !== "") return resolve(override);
  return join(repoRoot(), "evals", "results");
}

function readPackageVersion(): string {
  try {
    const path = join(repoRoot(), "package.json");
    const text = readFileSync(path, "utf8");
    const parsed = JSON.parse(text) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function detectBranch(): string {
  if (process.env.EVALS_BRANCH) return process.env.EVALS_BRANCH;
  try {
    return execFileSync(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return "unknown";
  }
}

function detectGitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "-");
}

export function buildResultFilename(opts: {
  version: string;
  branch: string;
  tier: Tier;
  timestamp: string;
}): string {
  return `${safeSegment(opts.version)}-${safeSegment(opts.branch)}-${safeSegment(opts.tier)}-${safeSegment(opts.timestamp)}.json`;
}

function atomicWriteJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, path);
}

// ---------------------------------------------------------------------------
// EvalCollector — incremental writer + finalize.
// ---------------------------------------------------------------------------

export class EvalCollector {
  private readonly tier: Tier;
  private readonly evalDir: string;
  private readonly path: string;
  private readonly startMs: number;
  private result: EvalResult;
  private finalized = false;

  /** Budget regressions detected against the previous run, populated by
   *  finalize(). Empty until finalize() runs (and stays empty when there
   *  is no prior run to compare against). Callers fail CI on a non-empty
   *  array — see `assertNoBudgetRegressions`. */
  budgetRegressions: BudgetRegression[] = [];

  constructor(tier: Tier, evalDir: string = defaultEvalDir()) {
    this.tier = tier;
    this.evalDir = evalDir;
    this.startMs = Date.now();

    const version = readPackageVersion();
    const branch = detectBranch();
    const timestamp = new Date().toISOString();
    const filename = buildResultFilename({ version, branch, tier, timestamp });
    this.path = join(evalDir, filename);

    this.result = {
      schema_version: SCHEMA_VERSION,
      version,
      branch,
      git_sha: detectGitSha(),
      timestamp,
      hostname: hostname(),
      tier,
      total_tests: 0,
      passed: 0,
      failed: 0,
      total_cost_usd: 0,
      total_duration_ms: 0,
      tests: [],
    };
    mkdirSync(this.evalDir, { recursive: true });
  }

  addTest(entry: EvalTestEntry): void {
    if (this.finalized) {
      throw new Error("EvalCollector: cannot addTest after finalize()");
    }
    // `--retry` re-runs the test body, so a flaky test calls addTest once per
    // attempt. Upsert by name so only the final post-retry outcome is recorded
    // — keeping the counts honest and the regression comparison free of stale
    // intermediate failures. Cost/duration still accumulate below: retries
    // really did spend money.
    const existing = this.result.tests.findIndex((t) => t.name === entry.name);
    if (existing >= 0) {
      this.result.tests[existing] = entry;
    } else {
      this.result.tests.push(entry);
    }
    this.result.total_tests = this.result.tests.length;
    this.result.passed = this.result.tests.filter((t) => t.passed).length;
    this.result.failed = this.result.total_tests - this.result.passed;
    this.result.total_cost_usd += entry.cost_usd;
    this.result.total_duration_ms += entry.duration_ms;
    atomicWriteJson(this.path, this.result);
  }

  /** Write final state to disk, print comparison against previous run on
   *  same (branch, tier) if one exists, and return the result filepath. */
  async finalize(): Promise<string> {
    if (this.finalized) return this.path;
    this.finalized = true;

    if (this.result.total_tests === 0) {
      return this.path;
    }

    this.result.wall_clock_ms = Date.now() - this.startMs;
    atomicWriteJson(this.path, this.result);

    const previous = findPreviousRun(this.tier, this.result.branch, this.evalDir, this.path);
    if (previous !== null) {
      const cmp = compareEvalResults(previous.result, this.result);
      const commentary = generateCommentary(cmp);
      this.budgetRegressions = findBudgetRegressions(cmp);
      process.stderr.write(
        `\n=== eval comparison: ${previous.filename} -> ${pathBasename(this.path)} ===\n`,
      );
      process.stderr.write(commentary + "\n");
      if (this.budgetRegressions.length > 0) {
        process.stderr.write(
          "BUDGET REGRESSIONS (fails the run):\n" +
            this.budgetRegressions
              .map((r) => `  - ${r.name}: ${r.reason}`)
              .join("\n") +
            "\n",
        );
      }
    } else {
      process.stderr.write(
        `\neval baseline written to ${this.path}; no previous run on branch ${this.result.branch}.\n`,
      );
    }

    return this.path;
  }
}

function pathBasename(p: string): string {
  const parts = p.split("/");
  return parts[parts.length - 1] ?? p;
}

/** Throw if the collector recorded budget regressions during finalize().
 *  Call this from an eval file's afterAll so a ≥2× efficiency regression
 *  fails the run (and therefore CI), not just prints to stderr. No-op when
 *  there was no prior run to compare against. */
export function assertNoBudgetRegressions(collector: EvalCollector): void {
  const regressions = collector.budgetRegressions;
  if (regressions.length > 0) {
    const detail = regressions.map((r) => `  - ${r.name}: ${r.reason}`).join("\n");
    throw new Error(`budget regression(s) detected:\n${detail}`);
  }
}

// ---------------------------------------------------------------------------
// findPreviousRun — same-branch preferred, cross-branch fallback.
// ---------------------------------------------------------------------------

export interface PreviousRun {
  filename: string;
  path: string;
  result: EvalResult;
}

function isEvalFile(name: string): boolean {
  return name.endsWith(".json") && !name.startsWith("_") && !name.endsWith(".tmp");
}

function parseFilename(name: string): {
  branch: string;
  tier: string;
  timestamp: string;
} | null {
  // Format: <version>-<branch>-<tier>-<timestamp>.json
  // We split from the right because the timestamp contains hyphens but the
  // tier and version don't. version is the first segment; tier is one of
  // {e2e, llm-judge}. We match tier by membership.
  const stem = name.replace(/\.json$/, "");
  // Find one of the known tiers (allow llm-judge with hyphen) and split.
  const tiers = ["llm-judge", "e2e"];
  for (const tier of tiers) {
    const marker = `-${tier}-`;
    const idx = stem.indexOf(marker);
    if (idx < 0) continue;
    const before = stem.slice(0, idx);
    const timestamp = stem.slice(idx + marker.length);
    // before = `<version>-<branch>`; we need to find where version ends.
    // Version often has digits and dots; branch can be anything. Take the
    // first dash as the version/branch separator.
    const firstDash = before.indexOf("-");
    if (firstDash < 0) continue;
    const branch = before.slice(firstDash + 1);
    return { branch, tier, timestamp };
  }
  return null;
}

export function findPreviousRun(
  tier: Tier,
  branch: string,
  evalDir: string = defaultEvalDir(),
  excludePath: string | null = null,
): PreviousRun | null {
  if (!existsSync(evalDir)) return null;
  const entries = readdirSync(evalDir, { withFileTypes: true });
  const candidates: { name: string; path: string; parsed: NonNullable<ReturnType<typeof parseFilename>> }[] = [];
  for (const dirent of entries) {
    if (!dirent.isFile() || !isEvalFile(dirent.name)) continue;
    const full = join(evalDir, dirent.name);
    if (excludePath !== null && resolve(full) === resolve(excludePath)) continue;
    const parsed = parseFilename(dirent.name);
    if (parsed === null) continue;
    if (parsed.tier !== tier) continue;
    candidates.push({ name: dirent.name, path: full, parsed });
  }
  if (candidates.length === 0) return null;

  // Prefer same-branch matches.
  const sameBranch = candidates.filter((c) => c.parsed.branch === branch);
  const pool = sameBranch.length > 0 ? sameBranch : candidates;
  pool.sort((a, b) => b.parsed.timestamp.localeCompare(a.parsed.timestamp));
  const winner = pool[0];
  if (winner === undefined) return null;

  try {
    const text = readFileSync(winner.path, "utf8");
    const result = JSON.parse(text) as EvalResult;
    return { filename: winner.name, path: winner.path, result };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// compareEvalResults — match tests by name, compute deltas.
// ---------------------------------------------------------------------------

export interface TestDelta {
  name: string;
  before: EvalTestEntry;
  after: EvalTestEntry;
  cost_delta: number;
  duration_delta: number;
  tools_delta: number;
  passed_changed: "now-passing" | "now-failing" | "stable-pass" | "stable-fail";
}

export interface EvalComparison {
  deltas: TestDelta[];
  added: EvalTestEntry[];
  removed: EvalTestEntry[];
  total_cost_delta: number;
  total_duration_delta: number;
  improved: number;
  regressed: number;
  unchanged: number;
}

export function extractToolCounts(transcript: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!Array.isArray(transcript)) return counts;
  for (const event of transcript) {
    if (typeof event !== "object" || event === null) continue;
    const ev = event as Record<string, unknown>;
    if (ev.type !== "assistant" || typeof ev.message !== "object" || ev.message === null) continue;
    const content = (ev.message as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (typeof item !== "object" || item === null) continue;
      const it = item as Record<string, unknown>;
      if (it.type === "tool_use" && typeof it.name === "string") {
        counts[it.name] = (counts[it.name] ?? 0) + 1;
      }
    }
  }
  return counts;
}

function totalToolCalls(transcript: unknown): number {
  let total = 0;
  for (const n of Object.values(extractToolCounts(transcript))) total += n;
  return total;
}

export function compareEvalResults(
  prev: EvalResult,
  curr: EvalResult,
): EvalComparison {
  const prevByName = new Map(prev.tests.map((t) => [t.name, t]));
  const currByName = new Map(curr.tests.map((t) => [t.name, t]));

  const deltas: TestDelta[] = [];
  const added: EvalTestEntry[] = [];
  const removed: EvalTestEntry[] = [];

  let improved = 0;
  let regressed = 0;
  let unchanged = 0;

  for (const [name, after] of currByName) {
    const before = prevByName.get(name);
    if (before === undefined) {
      added.push(after);
      continue;
    }
    const cost_delta = after.cost_usd - before.cost_usd;
    const duration_delta = after.duration_ms - before.duration_ms;
    const tools_delta =
      totalToolCalls(after.transcript) - totalToolCalls(before.transcript);

    let passed_changed: TestDelta["passed_changed"];
    if (before.passed && after.passed) passed_changed = "stable-pass";
    else if (!before.passed && !after.passed) passed_changed = "stable-fail";
    else if (after.passed) passed_changed = "now-passing";
    else passed_changed = "now-failing";

    if (passed_changed === "now-passing") improved += 1;
    else if (passed_changed === "now-failing") regressed += 1;
    else unchanged += 1;

    deltas.push({
      name,
      before,
      after,
      cost_delta,
      duration_delta,
      tools_delta,
      passed_changed,
    });
  }

  for (const [name, before] of prevByName) {
    if (!currByName.has(name)) removed.push(before);
  }

  return {
    deltas,
    added,
    removed,
    total_cost_delta: curr.total_cost_usd - prev.total_cost_usd,
    total_duration_delta: curr.total_duration_ms - prev.total_duration_ms,
    improved,
    regressed,
    unchanged,
  };
}

// ---------------------------------------------------------------------------
// findBudgetRegressions — automatic efficiency regression detector.
//
// A test that still passes but uses 3× more tool calls is a regression. We
// floor on tiny prior counts (1 -> 3 tools is noise, not a regression).
// ---------------------------------------------------------------------------

export interface BudgetRegression {
  name: string;
  reason: string;
}

export interface FindBudgetOptions {
  ratioCap?: number;
  minPriorTools?: number;
  minPriorTurns?: number;
}

function turnCount(transcript: unknown): number {
  if (!Array.isArray(transcript)) return 0;
  let n = 0;
  for (const ev of transcript) {
    if (typeof ev !== "object" || ev === null) continue;
    if ((ev as { type?: unknown }).type === "assistant") n += 1;
  }
  return n;
}

export function findBudgetRegressions(
  comparison: EvalComparison,
  options: FindBudgetOptions = {},
): BudgetRegression[] {
  const ratioCap = options.ratioCap ?? 2.0;
  const minPriorTools = options.minPriorTools ?? 3;
  const minPriorTurns = options.minPriorTurns ?? 3;

  const regressions: BudgetRegression[] = [];
  for (const d of comparison.deltas) {
    const priorTools = totalToolCalls(d.before.transcript);
    const currTools = totalToolCalls(d.after.transcript);
    if (priorTools >= minPriorTools && currTools / priorTools > ratioCap) {
      regressions.push({
        name: d.name,
        reason: `tool calls ${priorTools} -> ${currTools} (>${ratioCap}× growth)`,
      });
      continue;
    }
    const priorTurns = turnCount(d.before.transcript);
    const currTurns = turnCount(d.after.transcript);
    if (priorTurns >= minPriorTurns && currTurns / priorTurns > ratioCap) {
      regressions.push({
        name: d.name,
        reason: `turns ${priorTurns} -> ${currTurns} (>${ratioCap}× growth)`,
      });
    }
  }
  return regressions;
}

// ---------------------------------------------------------------------------
// generateCommentary — human-readable comparison summary.
// ---------------------------------------------------------------------------

export function generateCommentary(cmp: EvalComparison): string {
  const lines: string[] = [];

  const regressionDeltas = cmp.deltas.filter((d) => d.passed_changed === "now-failing");
  if (regressionDeltas.length > 0) {
    lines.push("REGRESSIONS:");
    for (const d of regressionDeltas) {
      lines.push(`  - ${d.name}: pass -> fail`);
    }
  }

  const improvedDeltas = cmp.deltas.filter((d) => d.passed_changed === "now-passing");
  if (improvedDeltas.length > 0) {
    lines.push("IMPROVEMENTS:");
    for (const d of improvedDeltas) {
      lines.push(`  - ${d.name}: fail -> pass`);
    }
  }

  if (cmp.added.length > 0) {
    lines.push(`ADDED (${cmp.added.length}): ${cmp.added.map((t) => t.name).join(", ")}`);
  }
  if (cmp.removed.length > 0) {
    lines.push(`REMOVED (${cmp.removed.length}): ${cmp.removed.map((t) => t.name).join(", ")}`);
  }

  // 20%-threshold deltas on cost or duration are worth surfacing.
  for (const d of cmp.deltas) {
    const beforeCost = d.before.cost_usd;
    if (beforeCost > 0 && Math.abs(d.cost_delta) / beforeCost >= 0.2) {
      const pct = ((d.cost_delta / beforeCost) * 100).toFixed(1);
      lines.push(`  cost ${d.name}: ${beforeCost.toFixed(4)} -> ${d.after.cost_usd.toFixed(4)} (${pct}%)`);
    }
  }

  if (lines.length === 0) {
    lines.push("no notable changes vs previous run.");
  }
  return lines.join("\n");
}
