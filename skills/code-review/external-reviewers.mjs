#!/usr/bin/env node

/**
 * Opt-in external-reviewer availability probe for the code-review lane.
 *
 * The IMPLEMENT-phase `code-reviewer` can corroborate its findings against
 * external review CLIs (codex, gemini) when `.claude-plugin/plugin.json`
 * names them under `externalReviewers`. Config *enables* a provider; this probe
 * *gates* it on the binary actually being installed and runnable. A provider
 * that is absent from config is never probed — config is the enable boundary,
 * detection only narrows it.
 *
 * The pure core (`parseConfig`, `probeProvider`, `availableReviewers`) is
 * unit-tested at L1 with injected probe primitives so the tests never spawn a
 * real binary. The CLI below is what the agent runs via Bash:
 *
 *     node "${CLAUDE_PLUGIN_ROOT}/skills/code-review/external-reviewers.mjs"
 *
 * STDOUT CONTRACT (so slice-3 agent prose can parse it deterministically): the
 * CLI writes the available provider names separated by a single space, followed
 * by a trailing newline — e.g. `codex gemini\n`. When no provider is available
 * (no config, missing binaries, or any error) it writes an empty string and
 * exits 0. Exit is non-zero only on the CLI's own internal failure; an empty
 * result is the graceful-degradation path ("behaves exactly as today").
 *
 * Fail-closed throughout: a missing, unauthenticated, errored, or hung CLI is
 * treated as absent (skipped), never as a hard failure of the review.
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The external review providers Team knows how to invoke. Frozen single source
 * of truth: provider name === binary name for both.
 */
export const KNOWN_PROVIDERS = Object.freeze(["codex", "gemini"]);

/**
 * Normalize the `externalReviewers` config into a deduped list of known
 * provider names. Accepts either the parsed `plugin.json` object (reads its
 * `externalReviewers` field) or the field's value directly.
 *
 * Returns `[]` for absent, empty, non-array, or all-unknown input — never
 * throws. Entries are trimmed, lowercased, deduped, and filtered to
 * `KNOWN_PROVIDERS`, so a name that is not a known provider can never be
 * probed (the config-enables / detection-gates boundary).
 */
export function parseConfig(raw) {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw) && "externalReviewers" in raw
      ? raw.externalReviewers
      : raw;
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const name = entry.trim().toLowerCase();
    if (!KNOWN_PROVIDERS.includes(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * True only when the provider's binary resolves AND its `--version` exits 0
 * within `timeoutMs`. Fail-closed: a missing binary, a non-zero exit, a thrown
 * error, or a timeout all yield false (the provider is skipped).
 *
 * `which` and `version` are injected so the unit suite can exercise every
 * branch without spawning a real process.
 */
export async function probeProvider(name, { which, version, timeoutMs = 5000 }) {
  try {
    const resolved = await withTimeout(which(name), timeoutMs);
    if (!resolved) return false;
    const code = await withTimeout(version(name), timeoutMs);
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * Compose `parseConfig` and `probeProvider`: return the subset of configured
 * providers whose binary is installed and runnable. Pure given injected `deps`
 * ({ which, version, timeoutMs? }). A provider absent from config is never
 * probed or reported, even when its binary is installed.
 */
export async function availableReviewers(config, deps) {
  const named = parseConfig(config);
  const results = await Promise.all(
    named.map(async (name) => ((await probeProvider(name, deps)) ? name : null)),
  );
  return results.filter((name) => name !== null);
}

/**
 * Reject after `ms` so a hung primitive cannot stall the probe. Resolves with
 * the wrapped value's promise when it settles first.
 *
 * `awaited` is either a bare promise (the injected-fake seam the unit suite
 * uses) or a `{ promise, child }` pair from a real primitive that spawned a
 * process. On the timeout path the spawned child is killed so a hung CLI does
 * not leak as an orphan process; behavior is otherwise identical (timeout still
 * ⇒ rejection ⇒ provider skipped).
 */
function withTimeout(awaited, ms) {
  const isPair = awaited && typeof awaited === "object" && "promise" in awaited;
  const promise = isPair ? awaited.promise : awaited;
  const child = isPair ? awaited.child : null;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (child) child.kill();
      reject(new Error("probe timeout"));
    }, ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Real `which`: resolve the binary path, or null when not on PATH. Returns a
 * `{ promise, child }` pair so `withTimeout` can kill the spawned process if it
 * hangs past the deadline.
 */
function realWhich(name) {
  const child = spawn("which", [name], { stdio: ["ignore", "pipe", "ignore"] });
  const promise = new Promise((resolve) => {
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 && out.trim() ? out.trim() : null));
  });
  return { promise, child };
}

/**
 * Real `--version`: resolve the binary's exit code (non-zero on any failure).
 * Returns a `{ promise, child }` pair so `withTimeout` can kill a hung process.
 */
function realVersion(name) {
  const child = spawn(name, ["--version"], { stdio: "ignore" });
  const promise = new Promise((resolve) => {
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
  return { promise, child };
}

// CLI entry point — runs only when executed directly, not when imported by a
// test (process.argv[1] is the test runner under `bun test`, so the import is
// side-effect free).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const configPath = join(root, ".claude-plugin", "plugin.json");
  readFile(configPath, "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => ({}))
    .then((config) =>
      availableReviewers(config, {
        which: realWhich,
        version: realVersion,
        timeoutMs: 5000,
      }),
    )
    .then((available) => {
      process.stdout.write(available.length ? `${available.join(" ")}\n` : "");
      process.exit(0);
    })
    .catch((err) => {
      process.stderr.write(`external-reviewers probe failed: ${err?.message ?? err}\n`);
      process.exit(1);
    });
}
