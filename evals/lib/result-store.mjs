// evals/lib/result-store.mjs
//
// Per-case result persistence + run-directory management.
//
// Contract:
//   - SCHEMA_VERSION is pinned at 1. Every written result carries it. The
//     comparator (compare.mjs) refuses to compare across mismatched
//     versions.
//   - Result filename convention: <version>-<branch>-<tier>-<timestamp>.json
//     so findPreviousRun can sort by timestamp and prefer same-branch.
//   - All writes are atomic: write to `<path>.tmp`, then rename. Readers
//     never see a half-written file.
//   - Locks are atomic too: `fs.openSync(..., 'wx')` throws EEXIST when
//     another runner holds the lock, which is the signal we want.
//
// Subprocess construction lives in run-agent.mjs (not here); this module
// is pure filesystem.

import { promises as fsp } from "node:fs";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export const SCHEMA_VERSION = 1;

const PARTIAL_NAME = "_partial-e2e.json";
const LOCK_NAME = "lock";

/**
 * Create (or reuse) a results directory for the given run id.
 * Returns the absolute path.
 */
export function createRunDir(resultsRoot, runId) {
  if (!resultsRoot) {
    throw new Error("createRunDir: resultsRoot is required");
  }
  if (!runId) {
    throw new Error("createRunDir: runId is required");
  }
  const runDir = join(resultsRoot, runId);
  mkdirSync(runDir, { recursive: true });
  return runDir;
}

/**
 * Build the per-case filename per the slice 1 convention:
 *   <schema_version>-<branch>-<tier>-<timestamp>-<case>.json
 * Timestamps are ISO-ish with colons replaced for filesystem safety.
 */
export function buildResultFilename({ branch, tier, timestamp, caseName }) {
  const safeBranch = (branch || "unknown").replace(/[^A-Za-z0-9._-]/g, "-");
  const safeTier = (tier || "periodic").replace(/[^A-Za-z0-9._-]/g, "-");
  const safeTs = (timestamp || new Date().toISOString()).replace(/[:]/g, "-");
  const safeCase = (caseName || "case").replace(/[^A-Za-z0-9._-]/g, "-");
  return `${SCHEMA_VERSION}-${safeBranch}-${safeTier}-${safeTs}-${safeCase}.json`;
}

/**
 * Write a single case's result. Atomic via `.tmp` + rename.
 * Adds `schema_version` if the caller forgot it.
 */
export function writeCaseResult(runDir, caseName, result) {
  if (!runDir) {
    throw new Error("writeCaseResult: runDir is required");
  }
  if (!caseName) {
    throw new Error("writeCaseResult: caseName is required");
  }
  const enriched = {
    schema_version: SCHEMA_VERSION,
    ...result,
  };
  const filename = buildResultFilename({
    branch: enriched.branch,
    tier: enriched.tier,
    timestamp: enriched.timestamp,
    caseName,
  });
  const finalPath = join(runDir, filename);
  const tmpPath = `${finalPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(enriched, null, 2) + "\n");
  renameSync(tmpPath, finalPath);
  return finalPath;
}

/**
 * Write the resume checkpoint. Atomic `.tmp` + rename so a kill
 * mid-write never leaves a torn file.
 */
export async function writePartial(runDir, state) {
  if (!runDir) {
    throw new Error("writePartial: runDir is required");
  }
  mkdirSync(runDir, { recursive: true });
  const finalPath = join(runDir, PARTIAL_NAME);
  const tmpPath = `${finalPath}.tmp`;
  const enriched = {
    schema_version: SCHEMA_VERSION,
    ...state,
  };
  await fsp.writeFile(tmpPath, JSON.stringify(enriched, null, 2) + "\n");
  await fsp.rename(tmpPath, finalPath);
  return finalPath;
}

/**
 * Load the resume checkpoint, or null when absent. Fails loud on parse
 * error — a corrupt checkpoint is not a missing checkpoint.
 */
export function loadPartial(runDir) {
  const path = join(runDir, PARTIAL_NAME);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Atomic lock acquisition. `wx` flag fails when the file exists,
 * which is the contract: only one runner per run-dir. Throws an Error
 * whose message starts with `run in progress` on collision so callers
 * (and tests) can grep for it.
 */
export function acquireLock(runDir) {
  mkdirSync(runDir, { recursive: true });
  const lockPath = join(runDir, LOCK_NAME);
  try {
    const fd = openSync(lockPath, "wx");
    writeFileSync(fd, String(process.pid));
    closeSync(fd);
    return lockPath;
  } catch (err) {
    if (err && err.code === "EEXIST") {
      const e = new Error(`run in progress: lock held at ${lockPath}`);
      e.code = "ELOCKED";
      throw e;
    }
    throw err;
  }
}

export function releaseLock(runDir) {
  const lockPath = join(runDir, LOCK_NAME);
  try {
    rmSync(lockPath, { force: true });
  } catch {
    // Releasing a lock that's already gone is fine — exit traps can
    // race with explicit release calls.
  }
}

/**
 * Keep the `keep` most-recently-modified run directories under
 * `resultsRoot`; rm the rest. Returns the list of removed paths.
 */
export function gc({ resultsRoot, keep = 10 }) {
  if (!resultsRoot) {
    throw new Error("gc: resultsRoot is required");
  }
  if (!existsSync(resultsRoot)) return [];
  const entries = readdirSync(resultsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const path = join(resultsRoot, e.name);
      let mtimeMs = 0;
      try {
        mtimeMs = statSync(path).mtimeMs;
      } catch {
        mtimeMs = 0;
      }
      return { path, mtimeMs };
    });
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs); // newest first
  const toRemove = entries.slice(keep);
  for (const { path } of toRemove) {
    rmSync(path, { recursive: true, force: true });
  }
  return toRemove.map((e) => e.path);
}

/**
 * Print the standard failure block to stdout, including the
 * rerun-on-base command so the contributor can verify "pre-existing"
 * before blaming the branch.
 */
export function printFailureBlock(result) {
  const lines = [];
  lines.push(`FAIL  ${result.case} (${result.agent}/${result.tier})`);
  lines.push(`  verdict:   ${result.verdict}`);
  lines.push(`  exit:      ${result.exit_reason}`);
  if (Array.isArray(result.criteria)) {
    for (const c of result.criteria) {
      lines.push(`  ${c.name} [${c.kind}]: ${c.score}`);
    }
  }
  lines.push("");
  lines.push("Rerun on the base branch to rule out a pre-existing failure:");
  lines.push(
    `  git checkout origin/main && bash evals/e2e/run.sh ${result.agent}`,
  );
  process.stdout.write(lines.join("\n") + "\n");
}
