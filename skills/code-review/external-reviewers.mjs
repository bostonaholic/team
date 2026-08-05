#!/usr/bin/env node

/**
 * External-reviewer availability probe for the code-review lane.
 *
 * The IMPLEMENT-phase `code-reviewer` corroborates its findings against
 * external review CLIs (codex, gemini) **by default** — multi-model review is
 * opt-out, not opt-in. This probe reports which of the known providers are
 * installed and runnable so the agent invokes the available ones and reports
 * the rest as skipped. A user opts out per-run by saying so in the prompt
 * (the orchestrator threads that into the dispatch); there is no config file.
 *
 * The pure cores (`probeProvider`, `probeProviders`, `buildInvocation`) are
 * unit-tested at L1 with injected probe primitives so the tests never spawn a
 * real binary. The CLI below is what the agent runs via Bash:
 *
 *     node "${CLAUDE_PLUGIN_ROOT}/skills/code-review/external-reviewers.mjs"
 *
 * It probes every KNOWN_PROVIDERS entry and prints a JSON object on stdout:
 *   {
 *     "available":   [{ "tool": "codex", "invoke": [...], "promptVia": "arg" }],
 *     "unavailable": ["gemini"]
 *   }
 * `available` entries carry the ready-to-run `invoke` argv prefix (from
 * `buildInvocation` — binary + read-only base args) and `promptVia` (`"arg"`
 * for codex, `"-p"` for gemini) so the agent runs EXACTLY what the probe emits
 * without rediscovering flags; `unavailable` names the providers the agent
 * reports as attempted-but-skipped.
 *
 * Fail-closed throughout: a missing, unauthenticated, errored, or hung CLI is
 * treated as unavailable (skipped + reported), never a hard failure of the
 * review. Each probe call (`which` + `--version`) gets its own ~5s `timeoutMs`
 * with `child.kill()` on timeout, so the worst case is ~10s per provider,
 * bounded per provider; providers are probed in parallel. The frozen
 * KNOWN_PROVIDERS allowlist gates every spawn (array-args, no shell).
 */

import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * The external review providers Team attempts by default. Frozen single source
 * of truth: provider name === binary name for both.
 */
export const KNOWN_PROVIDERS = Object.freeze(["codex", "gemini"]);

/**
 * The EXACT, verified non-interactive invocation each provider's CLI takes —
 * the single source of truth so the runtime never has to discover the flags.
 * Both CLIs read the `git diff` on **stdin** and take a review-instruction
 * prompt, run **read-only** (no edits), and are fully headless.
 *
 * Per tool:
 *   - `binary`    — the executable name (=== the provider name).
 *   - `baseArgs`  — the fixed, always-present args that pin the non-interactive
 *                   read-only mode. codex: `exec --sandbox read-only`
 *                   (the `exec` subcommand is non-interactive; `--sandbox
 *                   read-only` forbids writes). gemini: `--approval-mode plan
 *                   --skip-trust` (`--approval-mode plan` is the read-only mode;
 *                   `--skip-trust` trusts the workspace so a headless run never
 *                   hangs on a trust prompt).
 *   - `modelFlag` — the flag that selects a model (`-m` for both); appended only
 *                   when a non-null model is passed (else the CLI default).
 *   - `promptVia` — how the review prompt is passed at runtime: `"arg"` for
 *                   codex (a trailing positional arg), `"-p"` for gemini (after
 *                   the `-p` flag). The diff is stdin for both.
 *
 * No model *version* is hardcoded here — models go stale; the model defaults to
 * each CLI's own default. Frozen (deeply) so it is a read-only contract.
 */
export const PROVIDER_INVOCATION = Object.freeze({
  codex: Object.freeze({
    binary: "codex",
    baseArgs: Object.freeze(["exec", "--sandbox", "read-only"]),
    modelFlag: "-m",
    promptVia: "arg",
  }),
  gemini: Object.freeze({
    binary: "gemini",
    baseArgs: Object.freeze(["--approval-mode", "plan", "--skip-trust"]),
    modelFlag: "-m",
    promptVia: "-p",
  }),
});

/**
 * Build the argv **prefix** for a provider invocation — binary + fixed base
 * args + `-m <model>` when `model` is a non-null string. This is everything
 * EXCEPT the review prompt (the agent supplies it at runtime) and the piped
 * diff (stdin). Pure and tested.
 *
 *   buildInvocation("codex")
 *     → ["codex", "exec", "--sandbox", "read-only"]
 *   buildInvocation("gemini", "gemini-3-pro")
 *     → ["gemini", "--approval-mode", "plan", "--skip-trust", "-m", "gemini-3-pro"]
 *
 * Throws on an unknown tool (fail fast, fail loud) — callers pass only
 * KNOWN_PROVIDERS entries.
 */
export function buildInvocation(tool, model = null) {
  const spec = PROVIDER_INVOCATION[tool];
  if (!spec) {
    throw new Error(`unknown external reviewer tool: ${tool}`);
  }
  const prefix = [spec.binary, ...spec.baseArgs];
  if (typeof model === "string" && model) {
    prefix.push(spec.modelFlag, model);
  }
  return prefix;
}

/**
 * True only when the provider's binary resolves AND its `--version` exits 0
 * within `timeoutMs`. Fail-closed: a missing binary, a non-zero exit, a thrown
 * error, or a timeout all yield false (the provider is unavailable).
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
 * Probe every KNOWN_PROVIDERS entry and split them into available vs.
 * unavailable. Multi-model review is opt-out, so every known provider is
 * attempted; the unavailable ones are reported (attempted-but-skipped), never
 * silently dropped. Pure given injected `deps` ({ which, version, timeoutMs? });
 * providers are probed in parallel.
 */
export async function probeProviders(deps) {
  const results = await Promise.all(
    KNOWN_PROVIDERS.map(async (tool) => ({ tool, ok: await probeProvider(tool, deps) })),
  );
  return {
    available: results.filter((r) => r.ok).map((r) => ({ tool: r.tool })),
    unavailable: results.filter((r) => !r.ok).map((r) => r.tool),
  };
}

/**
 * Reject after `ms` so a hung primitive cannot stall the probe. Resolves with
 * the wrapped value's promise when it settles first.
 *
 * `awaited` is either a bare promise (the injected-fake seam the unit suite
 * uses) or a `{ promise, child }` pair from a real primitive that spawned a
 * process. On the timeout path the spawned child is killed so a hung CLI does
 * not leak as an orphan process; behavior is otherwise identical (timeout still
 * ⇒ rejection ⇒ provider unavailable).
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

const PROBE_DEPS = { which: realWhich, version: realVersion, timeoutMs: 5000 };

/**
 * Default mode: probe every known provider and print
 * `{ available: [{tool, invoke, promptVia}], unavailable: [tool] }`. The agent
 * invokes each available provider with its ready-to-run `invoke` argv (no flag
 * rediscovery) and reports every `unavailable` one as attempted-but-skipped.
 */
async function runDefault() {
  const { available, unavailable } = await probeProviders(PROBE_DEPS);
  const enriched = available.map((r) => ({
    tool: r.tool,
    invoke: buildInvocation(r.tool),
    promptVia: PROVIDER_INVOCATION[r.tool].promptVia,
  }));
  process.stdout.write(`${JSON.stringify({ available: enriched, unavailable })}\n`);
}

// CLI entry point — runs only when executed directly, not when imported by a
// test (process.argv[1] is the test runner under `bun test`, so the import is
// side-effect free). `realpathSync` resolves a symlinked plugin install (e.g.
// `~/.claude/plugins/<name>` → a worktree) so the invoked path matches the
// symlink-resolved `import.meta.url`; without it the guard is false under a
// symlink and the CLI silently no-ops (prints nothing, exits 0).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  runDefault()
    .then(() => process.exit(0))
    .catch((err) => {
      process.stderr.write(`external-reviewers failed: ${err?.message ?? err}\n`);
      process.exit(1);
    });
}
