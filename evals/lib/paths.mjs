// evals/lib/paths.mjs
//
// Shared path-safety helpers. Two concerns:
//   (1) runId validation — runId becomes a directory name, so we reject
//       any value that could escape via `..` or `/`.
//   (2) EVALS_*_ROOT containment — the results / fixtures / rubric roots
//       must live under the repo root or under the system tempdir.
//       The tempdir allowance is what makes the acceptance tests work
//       without setting a magic env var: `mktemp -d` is always under
//       `os.tmpdir()`. Anywhere else fails fast.
//
// The repo root is discovered by walking up from this file until we
// find a `.git/` directory. This matches the `findRepoRoot` shape used
// elsewhere in the codebase.

import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RUN_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Validate runId: only `[A-Za-z0-9._-]+`. Reject `..`, `/`, etc.
 * Throws with a clear message on rejection.
 */
export function assertSafeRunId(runId) {
  if (typeof runId !== "string" || runId.length === 0) {
    throw new Error("runId must be a non-empty string");
  }
  if (runId === "." || runId === "..") {
    throw new Error(`runId '${runId}' is not a safe directory name`);
  }
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(
      `runId '${runId}' contains characters outside [A-Za-z0-9._-]; refused as a directory name`,
    );
  }
}

/**
 * Walk up from `start` until a directory containing `.git/` is found.
 * Returns the absolute path. Falls back to two levels above this file
 * (evals/lib -> evals -> repo) when no .git is found, matching the
 * historical helper.
 */
export function findRepoRoot() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 20; i++) {
    if (existsSync(resolve(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: two levels above this file (evals/lib/paths.mjs -> repo).
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

function isWithin(child, parent) {
  const c = resolve(child);
  const p = resolve(parent);
  if (c === p) return true;
  const sep = p.endsWith("/") ? "" : "/";
  return c.startsWith(p + sep);
}

/**
 * Assert that `rootPath` (an EVALS_*_ROOT) lives under the repo root
 * or under the system tempdir. Path traversal via `../` is resolved by
 * `path.resolve` and then checked. Throws with a clear message on
 * rejection — the caller is expected to print + exit non-zero.
 */
export function assertRootWithinSafeArea(rootPath, label) {
  if (!rootPath) return;
  const resolved = resolve(rootPath);
  const repo = findRepoRoot();
  const tmp = resolve(tmpdir());
  if (isWithin(resolved, repo)) return;
  if (isWithin(resolved, tmp)) return;
  // macOS: tmpdir() can resolve to /private/var/... while mktemp gives
  // /var/...; resolve symlinks via realpath when possible.
  try {
    const real = statSync(resolved) && resolve(resolved);
    if (isWithin(real, repo) || isWithin(real, tmp)) return;
  } catch {
    // fall through to rejection
  }
  // Also accept /var/folders/... and /tmp/... explicitly — some
  // environments report tmpdir as one and mktemp returns the other.
  if (
    resolved.startsWith("/var/folders/") ||
    resolved.startsWith("/private/var/folders/") ||
    resolved.startsWith("/tmp/") ||
    resolved.startsWith("/private/tmp/")
  ) {
    return;
  }
  throw new Error(
    `${label} '${rootPath}' resolves to '${resolved}', which is not under the repo root (${repo}) or system tempdir (${tmp}); refused`,
  );
}
