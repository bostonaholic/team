// evals/lib/runner.mjs
//
// E2E run orchestration. The bash entry script (`evals/e2e/run.sh`) is a
// thin wrapper that delegates here so the orchestration logic stays
// testable and atomic.
//
// Environment seams (documented in evals/README.md):
//   ANTHROPIC_API_KEY  required unless EVALS_MOCK_AGENT is set
//   PERIODIC=1         required to actually call the model
//   ALL=1              skip diff-based selection
//   EVALS_FIXTURE_ROOT override evals/fixtures (tests)
//   EVALS_RUBRIC_ROOT  override evals/rubrics (tests)
//   EVALS_RESULTS_ROOT override evals/results (tests)
//   EVALS_RUN_ID       force a specific run-id (tests; for lock collisions)
//   EVALS_MOCK_AGENT   mock agent output path (tests)
//   EVALS_MOCK_JUDGE   mock judge JSON path (tests)
//   EVALS_FAKE_CHANGED_FILES   comma-separated; bypass git diff
//   EVALS_FAKE_GIT_DIFF_FAIL   simulate shallow-clone/detached HEAD
//   EVALS_TIMEOUT      per-case agent subprocess timeout (seconds)
//   EVALS_WALLCLOCK_CAP   total run wall-clock cap (seconds)
//   EVALS_CASE_NAME    set per-case before invoking agent (consumed by mocks)
//
// Path-safety contract:
//   - runId is constrained to `[A-Za-z0-9._-]+`; `..` or `/` are refused.
//   - Every EVALS_*_ROOT must resolve inside the repo root or under
//     the system tempdir. Anything else fails fast.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  acquireLock,
  createRunDir,
  loadPartial,
  printFailureBlock,
  releaseLock,
  writeCaseResult,
  writePartial,
} from "./result-store.mjs";
import { runAgent } from "./run-agent.mjs";
import { runJudge } from "./judge.mjs";
import {
  assertRootWithinSafeArea,
  assertSafeRunId,
  findRepoRoot,
} from "./paths.mjs";

const DEFAULT_WALLCLOCK_SEC = 30 * 60;

function repoRoot() {
  return findRepoRoot();
}

function fixtureRoot() {
  const raw = process.env.EVALS_FIXTURE_ROOT || join(repoRoot(), "evals/fixtures");
  assertRootWithinSafeArea(raw, "EVALS_FIXTURE_ROOT");
  return resolve(raw);
}

function rubricRoot() {
  const raw = process.env.EVALS_RUBRIC_ROOT || join(repoRoot(), "evals/rubrics");
  assertRootWithinSafeArea(raw, "EVALS_RUBRIC_ROOT");
  return resolve(raw);
}

function resultsRoot() {
  const raw = process.env.EVALS_RESULTS_ROOT || join(repoRoot(), "evals/results");
  assertRootWithinSafeArea(raw, "EVALS_RESULTS_ROOT");
  return resolve(raw);
}

function nowIso() {
  return new Date().toISOString();
}

function listFixtures(agentName) {
  const root = fixtureRoot();
  const agentDir = join(root, agentName);
  if (!existsSync(agentDir)) return [];
  const cases = [];
  for (const dirent of readdirSync(agentDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const caseDir = join(agentDir, dirent.name);
    const inputPath = join(caseDir, "input.md");
    const groundTruthPath = join(caseDir, "ground-truth.json");
    cases.push({
      caseName: dirent.name,
      caseDir,
      inputPath,
      groundTruthPath,
    });
  }
  return cases;
}

function rubricPathFor(agentName) {
  return join(rubricRoot(), `${agentName}.md`);
}

function detectBranch() {
  if (process.env.EVALS_BRANCH) return process.env.EVALS_BRANCH;
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Public entry: orchestrate a single E2E run.
// ---------------------------------------------------------------------------

export async function main(argv) {
  // CLI shape (kept tiny):
  //   node runner.mjs                    -> auto-detect agents under fixtureRoot
  //   node runner.mjs <agent>            -> just that agent
  //   node runner.mjs <agent> --resume <run-id>
  let agentName = null;
  let resumeRunId = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--resume") {
      resumeRunId = argv[++i];
    } else if (!a.startsWith("--")) {
      agentName = agentName || a;
    }
  }

  if (resumeRunId !== null) {
    try {
      assertSafeRunId(resumeRunId);
    } catch (err) {
      process.stderr.write(`runner: ${err.message}\n`);
      return 1;
    }
  }

  const mockingAgent = !!process.env.EVALS_MOCK_AGENT;

  // Diff-based selection (no <agent> arg path); if EVALS_FAKE_CHANGED_FILES
  // is set, the selector uses it directly. Lazy-import so slice 1 doesn't
  // need the selector module on disk. The empty-match exit happens BEFORE
  // the PERIODIC/key preflight: there's nothing to spend money on.
  let casesToRun;
  if (!agentName) {
    const { getChangedFiles, selectCases } = await import("./select.mjs");
    let changed;
    if (process.env.EVALS_FAKE_CHANGED_FILES !== undefined) {
      changed = process.env.EVALS_FAKE_CHANGED_FILES
        .split(",")
        .filter(Boolean);
    } else {
      changed = getChangedFiles({});
      if (changed === null) {
        process.stderr.write(
          "warning: git diff failed (shallow clone / detached HEAD); falling back to running all cases\n",
        );
      }
    }
    const all = process.env.ALL === "1";
    let selected;
    try {
      selected = selectCases({
        fixtureRoot: fixtureRoot(),
        changedFiles: changed,
        all,
      });
    } catch (err) {
      if (err.code === "EMALFORMED_DEPS") {
        process.stderr.write(`selector: ${err.message}\n`);
        return 1;
      }
      throw err;
    }
    if (selected.length === 0) {
      process.stdout.write(
        "no matching evals; use `ALL=1` to force a full run.\n",
      );
      return 0;
    }
    casesToRun = selected;
  } else {
    // Single-agent path: enumerate that agent's cases.
    casesToRun = listFixtures(agentName).map((c) => ({
      ...c,
      agent: agentName,
    }));
  }

  // Pre-flight: ANTHROPIC_API_KEY check (mock seams suppress it).
  if (!mockingAgent && !process.env.ANTHROPIC_API_KEY) {
    process.stderr.write(
      "ANTHROPIC_API_KEY is required to invoke the model (mock seam not set).\n",
    );
    return 3;
  }
  if (!mockingAgent && !process.env.PERIODIC) {
    process.stderr.write(
      "PERIODIC=1 is required to acknowledge the cost of E2E + judge calls.\n",
    );
    return 3;
  }

  return await runSelectedCases(casesToRun, { resumeRunId });
}

async function runSelectedCases(cases, { resumeRunId }) {
  if (cases.length === 0) {
    process.stdout.write("no cases to run.\n");
    return 0;
  }

  // Validate the run-id source before it becomes a directory name.
  const envRunId = process.env.EVALS_RUN_ID;
  if (envRunId !== undefined && envRunId !== "") {
    try {
      assertSafeRunId(envRunId);
    } catch (err) {
      process.stderr.write(`runner: EVALS_RUN_ID: ${err.message}\n`);
      return 1;
    }
  }

  const runId = resumeRunId || envRunId || newRunId();
  const runDir = createRunDir(resultsRoot(), runId);

  // Concurrency lock: fail fast on collision.
  try {
    acquireLock(runDir);
  } catch (err) {
    if (err.code === "ELOCKED") {
      process.stderr.write(
        `run in progress: another runner holds the lock for run-id ${runId}\n`,
      );
      return 4;
    }
    throw err;
  }

  let exitCode = 0;
  const branch = detectBranch();
  const tier = "periodic";
  const wallCap = parseInt(
    process.env.EVALS_WALLCLOCK_CAP || String(DEFAULT_WALLCLOCK_SEC),
    10,
  );
  const startMs = Date.now();

  // Resume: skip cases already in the partial.
  const partial = resumeRunId ? loadPartial(runDir) : null;
  const completed = new Set(
    (partial && Array.isArray(partial.completed_cases)
      ? partial.completed_cases
      : []),
  );

  try {
    for (const c of cases) {
      if (completed.has(c.caseName)) {
        continue;
      }
      if ((Date.now() - startMs) / 1000 > wallCap) {
        process.stderr.write(
          `wall-clock cap (${wallCap}s) reached; stopping.\n`,
        );
        break;
      }

      const result = await runOneCase({
        agentName: c.agent,
        caseName: c.caseName,
        inputPath: c.inputPath,
        groundTruthPath: c.groundTruthPath,
        branch,
        tier,
      });
      result.run_id = runId;

      writeCaseResult(runDir, c.caseName, result);
      completed.add(c.caseName);
      await writePartial(runDir, {
        run_id: runId,
        completed_cases: [...completed],
      });

      if (result.verdict !== "pass") {
        printFailureBlock(result);
        exitCode = 2;
      }
    }
  } finally {
    releaseLock(runDir);
  }

  return exitCode;
}

async function runOneCase({
  agentName,
  caseName,
  inputPath,
  groundTruthPath,
  branch,
  tier,
}) {
  // 1. Run the agent (real or mocked).
  let agentResult;
  try {
    agentResult = await runAgent({
      agentName,
      inputPath,
      caseName,
    });
  } catch (err) {
    return {
      case: caseName,
      agent: agentName,
      tier,
      branch,
      verdict: "fail",
      status: "errored",
      exit_reason: `agent_error: ${err.message}`,
      timestamp: nowIso(),
      run_id: "",
      criteria: [],
    };
  }

  // Timeout / error path: produce a record without invoking the judge.
  if (agentResult.exitReason === "timeout") {
    return {
      case: caseName,
      agent: agentName,
      tier,
      branch,
      verdict: "fail",
      status: "errored",
      exit_reason: "timeout",
      timestamp: nowIso(),
      run_id: "",
      criteria: [],
    };
  }
  if (agentResult.exitReason !== "ok") {
    return {
      case: caseName,
      agent: agentName,
      tier,
      branch,
      verdict: "fail",
      status: "errored",
      exit_reason: agentResult.exitReason,
      timestamp: nowIso(),
      run_id: "",
      criteria: [],
    };
  }

  // 2. Judge.
  const rubricPath = rubricPathFor(agentName);
  let judged;
  try {
    judged = await runJudge({
      rubricPath,
      agentOutput: agentResult.output || "",
      groundTruthPath,
    });
  } catch (err) {
    return {
      case: caseName,
      agent: agentName,
      tier,
      branch,
      verdict: "fail",
      status: "errored",
      exit_reason: `judge_error: ${err.message}`,
      timestamp: nowIso(),
      run_id: "",
      criteria: [],
    };
  }

  return {
    case: caseName,
    agent: agentName,
    tier,
    branch,
    verdict: judged.verdict,
    status: judged.verdict === "pass" ? "passed" : "failed",
    exit_reason: "ok",
    timestamp: nowIso(),
    run_id: "",
    criteria: judged.criteria,
  };
}

function newRunId() {
  // Colons are unsafe for filenames; the rest of the timestamp is already
  // in the safe character set.
  return `run-${nowIso().replace(/[:.]/g, "-")}`;
}

// CLI entry.
if (process.argv[1] && process.argv[1].endsWith("runner.mjs")) {
  const code = await main(process.argv.slice(2));
  process.exit(code);
}
