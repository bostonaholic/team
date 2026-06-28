#!/usr/bin/env node

/**
 * Opt-in external-reviewer config + availability probe for the code-review lane.
 *
 * The IMPLEMENT-phase `code-reviewer` can corroborate its findings against
 * external review CLIs (codex, gemini). The selection lives in a user-owned,
 * per-project file, `.claude/team.json`, in the repo under review (NOT the
 * plugin's distributed manifest — that file is the author's and is overwritten
 * on every plugin update). Schema:
 *
 *     { "review": { "externalReviewers": ["codex", { "tool": "gemini", "model": "gemini-3-pro" }] } }
 *
 * Each entry is a provider-name string OR a `{ tool, model? }` object. The list
 * normalizes to `[{ tool, model: string|null }]`, filtered to KNOWN_PROVIDERS
 * and deduped by tool.
 *
 * Decided vs. undecided (load-bearing): `review.externalReviewers` being
 * **absent** — or the file missing / malformed / wrong-typed — means
 * *undecided* (the orchestrator's detect-and-prompt on-ramp may fire). The key
 * being **present, even `[]`** means *decided* — never prompt, `[]` = explicit
 * Claude-only. `parseTeamConfig` exposes this as `{ decided, reviewers }`.
 *
 * Config *enables* a provider; the probe *gates* it on the binary actually
 * being installed and runnable. A provider absent from config is never probed
 * for the default mode — config is the enable boundary, detection only narrows
 * it. (`detectCandidates`, the prompt-menu source, ignores config by design.)
 *
 * The pure cores (`parseTeamConfig`, `probeProvider`, `availableReviewers`,
 * `detectCandidates`, `mergeDecision`) are unit-tested at L1 with injected probe
 * primitives so the tests never spawn a real binary or touch the filesystem.
 * The CLI below is what the agent / orchestrator runs via Bash:
 *
 *     node "${CLAUDE_PLUGIN_ROOT}/skills/code-review/external-reviewers.mjs" [mode]
 *
 * CLI modes:
 *   (default)        read `.claude/team.json` in cwd, probe, and print the
 *                    available reviewers as a JSON array of `{tool,model}` so
 *                    model passthrough is unambiguous — e.g.
 *                    `[{"tool":"codex","model":null}]`. An empty array `[]`
 *                    (nothing configured or nothing installed) is the
 *                    graceful-degradation path: "behave exactly as today."
 *   --candidates     print the installed KNOWN_PROVIDERS as a JSON array of tool
 *                    names (ignoring config) — the orchestrator's detect step
 *                    feeds this into its prompt menu.
 *   --set <csv|''>   merge the decision into `.claude/team.json` (creating
 *                    `.claude/` + the file when needed, preserving other keys
 *                    via `mergeDecision`). `--set codex,gemini` records those
 *                    tools; `--set ''` records `[]` (explicit Claude-only).
 *
 * Fail-closed throughout: a missing, unauthenticated, errored, or hung CLI is
 * treated as absent (skipped), never as a hard failure of the review. The
 * ~5s probe timeout and `child.kill()` on timeout bound latency, and the frozen
 * KNOWN_PROVIDERS allowlist gates every spawn (array-args, no shell).
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The external review providers Team knows how to invoke. Frozen single source
 * of truth: provider name === binary name for both.
 */
export const KNOWN_PROVIDERS = Object.freeze(["codex", "gemini"]);

/**
 * Normalize a `review.externalReviewers` array into a deduped list of
 * `{ tool, model }`. Each entry is a provider-name string (model defaults to
 * null) or a `{ tool, model? }` object. Entries are trimmed, lowercased,
 * filtered to KNOWN_PROVIDERS, and deduped by tool (first occurrence wins); a
 * non-string `model` collapses to null.
 */
function normalizeReviewers(value) {
  const seen = new Set();
  const out = [];
  for (const entry of value) {
    let tool;
    let model = null;
    if (typeof entry === "string") {
      tool = entry;
    } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      tool = entry.tool;
      model =
        typeof entry.model === "string" && entry.model.trim() ? entry.model.trim() : null;
    } else {
      continue;
    }
    if (typeof tool !== "string") continue;
    tool = tool.trim().toLowerCase();
    if (!KNOWN_PROVIDERS.includes(tool)) continue;
    if (seen.has(tool)) continue;
    seen.add(tool);
    out.push({ tool, model });
  }
  return out;
}

/**
 * Parse a `.claude/team.json` object into `{ decided, reviewers }`.
 *
 * `decided` is true only when `review.externalReviewers` is present AND an
 * array (even an empty one — `[]` is the explicit "Claude-only" decision).
 * Anything else — a missing file (passed as `{}`/null), missing `review`,
 * missing or wrong-typed `externalReviewers` — is *undecided* (`decided:
 * false`), the state that lets the orchestrator's detect-and-prompt on-ramp
 * fire. Never throws: a malformed config degrades to undecided.
 */
export function parseTeamConfig(obj) {
  const review =
    obj && typeof obj === "object" && !Array.isArray(obj) ? obj.review : undefined;
  const value =
    review && typeof review === "object" && !Array.isArray(review)
      ? review.externalReviewers
      : undefined;
  if (!Array.isArray(value)) return { decided: false, reviewers: [] };
  return { decided: true, reviewers: normalizeReviewers(value) };
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
 * Return the subset of an already-parsed reviewer list (`[{ tool, model }]`,
 * from `parseTeamConfig`) whose binary is installed and runnable, preserving
 * each entry's `model` passthrough. Pure given injected `deps`
 * ({ which, version, timeoutMs? }). A provider absent from the list is never
 * probed or reported, even when its binary is installed.
 */
export async function availableReviewers(reviewers, deps) {
  const list = Array.isArray(reviewers) ? reviewers : [];
  const results = await Promise.all(
    list.map(async (r) => ((await probeProvider(r.tool, deps)) ? r : null)),
  );
  return results.filter((r) => r !== null);
}

/**
 * Return which KNOWN_PROVIDERS are installed and runnable on this host,
 * ignoring config entirely. This is the prompt-menu source for the
 * orchestrator's detect-and-prompt on-ramp — it surfaces installable
 * candidates, it does not enable any of them. Pure given injected `deps`.
 */
export async function detectCandidates(deps) {
  const results = await Promise.all(
    KNOWN_PROVIDERS.map(async (tool) => ((await probeProvider(tool, deps)) ? tool : null)),
  );
  return results.filter((tool) => tool !== null);
}

/**
 * Produce the `.claude/team.json` object to write for a recorded decision,
 * preserving every other key. Pure (no fs) so the write is unit-testable:
 * sets `review.externalReviewers` to `reviewers` and leaves all other top-level
 * keys and other `review.*` keys intact. `reviewers` is an array (a list of
 * provider-name strings or `{ tool, model }` entries; `[]` for Claude-only).
 */
export function mergeDecision(existingObj, reviewers) {
  const base =
    existingObj && typeof existingObj === "object" && !Array.isArray(existingObj)
      ? existingObj
      : {};
  const review =
    base.review && typeof base.review === "object" && !Array.isArray(base.review)
      ? base.review
      : {};
  return {
    ...base,
    review: { ...review, externalReviewers: reviewers },
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

const PROBE_DEPS = { which: realWhich, version: realVersion, timeoutMs: 5000 };

/** Read + JSON-parse `.claude/team.json` under `root`; `{}` on any failure. */
async function readTeamConfig(root) {
  const configPath = join(root, ".claude", "team.json");
  return readFile(configPath, "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => ({}));
}

/** Default mode: print the available reviewers as a JSON array of {tool,model}. */
async function runDefault(root) {
  const config = await readTeamConfig(root);
  const { reviewers } = parseTeamConfig(config);
  const available = await availableReviewers(reviewers, PROBE_DEPS);
  process.stdout.write(`${JSON.stringify(available)}\n`);
}

/** `--candidates`: print installed KNOWN_PROVIDERS as a JSON array of tool names. */
async function runCandidates() {
  const candidates = await detectCandidates(PROBE_DEPS);
  process.stdout.write(`${JSON.stringify(candidates)}\n`);
}

/** `--set <csv|''>`: record the decision into `.claude/team.json`. */
async function runSet(root, csv) {
  const tools = [
    ...new Set(
      String(csv ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s && KNOWN_PROVIDERS.includes(s)),
    ),
  ];
  const existing = await readTeamConfig(root);
  const next = mergeDecision(existing, tools);
  const configPath = join(root, ".claude", "team.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(next.review.externalReviewers)}\n`);
}

// CLI entry point — runs only when executed directly, not when imported by a
// test (process.argv[1] is the test runner under `bun test`, so the import is
// side-effect free).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Config lives in the user's project, not the plugin install dir: resolve
  // from cwd (the repo under review), never CLAUDE_PLUGIN_ROOT.
  const root = process.cwd();
  const mode = process.argv[2];
  const run =
    mode === "--candidates"
      ? runCandidates()
      : mode === "--set"
        ? runSet(root, process.argv[3])
        : runDefault(root);
  run
    .then(() => process.exit(0))
    .catch((err) => {
      process.stderr.write(`external-reviewers failed: ${err?.message ?? err}\n`);
      process.exit(1);
    });
}
