#!/usr/bin/env node

/**
 * Cross-vendor review runner for the cross-model-review skill.
 *
 * Two verbs, both fail-closed:
 *
 *     node <skill-dir>/external-review.mjs detect <repo-root>
 *     node <skill-dir>/external-review.mjs run <cli> <repo-root> [timeout-ms]
 *
 * Both verbs check the consent marker `.team/cross-model-review` before
 * any lookup or spawn (only the machine-policy kill-switch below outranks
 * it). `detect` reports per-CLI availability: without the marker
 * the answer is unavailable and no binary claim is made, so a repo that never
 * opted in never even learns what sits on PATH. `run` refuses with a non-zero
 * exit before any child process spawns when the marker is absent. With
 * consent, `run` reads the review prompt from stdin and invokes the named CLI
 * with a pinned argv.
 *
 * Trust model per CLI: codex and agy run with their full-access flags
 * (`--dangerously-bypass-approvals-and-sandbox`,
 * `--dangerously-skip-permissions`) in the repo cwd — unsandboxed, with the
 * invoking user's permissions — so they can read the codebase they review;
 * the consent marker is consent to exactly that grant. gemini stays in plan
 * approval mode and runs from an empty scratch directory, never the repo.
 * Every CLI gets an allowlisted environment, never the parent's full env,
 * so env-only secrets (ANTHROPIC_API_KEY, GH_TOKEN) stay with the parent.
 *
 * Prompt delivery: codex and gemini read the prompt on stdin (then EOF,
 * which defeats the stdin-block hang), so it never rides argv where the
 * process table would expose it. agy cannot read stdin, so its prompt is
 * the `-p` flag's value — visible in the process table for the call's
 * duration. agy's known headless hangs are already covered here: the
 * timeout kill is SIGKILL-only (a trapped SIGTERM cannot outlive it) and
 * exit 0 with empty stdout reads as a skip, never a silent success.
 * Guard failures (unknown CLI, prompt over the cap) are usage errors that
 * also exit before any child process spawns, so a rejected attempt consumes
 * nothing.
 *
 * The trailing [timeout-ms] argument exists for the accelerated-timeout test
 * only; the skill's documented invocation never passes it. One deliberate
 * environment knob exists — TEAM_DISABLE_CROSS_MODEL, the machine-policy
 * kill-switch checked above the consent marker in both verbs (any non-empty
 * value disables, fail closed) — and no other; no relative imports — the
 * script runs from any install path.
 *
 * The pure pieces below are exported for L1 tests
 * (tests/cross-model-review.test.ts); the CLI runs only when executed
 * directly, so `bun test` imports are side-effect free.
 */

import { spawn } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

/** In-process kill timer for a hung CLI (macOS ships no `timeout` binary). */
export const TIMEOUT_MS = 120_000;

/** Hard ceiling on the prompt sent to an external vendor: 128 KB. */
export const PROMPT_CAP_BYTES = 128 * 1024;

/** Hard ceiling on the output read back from an external vendor: 32 KB. */
export const OUTPUT_CAP_BYTES = 32 * 1024;

/** Consent marker, relative to the repo root. Checked before anything else. */
export const MARKER_RELATIVE_PATH = join(".team", "cross-model-review");

/**
 * Ceiling on stderr retained for a skip reason. Stderr is diagnostic noise,
 * not the review, so it gets a much smaller cap than stdout.
 */
const STDERR_CAP_BYTES = 4 * 1024;

/**
 * The only environment variables a vendor CLI child receives. PATH/HOME/
 * TMPDIR/TERM and the locale pair keep the CLI functional (all three read
 * their config and cached auth under HOME); the per-vendor block is that
 * CLI's own credentials, and no vendor ever receives another's. Everything
 * else — ANTHROPIC_API_KEY, GH_TOKEN, cloud creds — stays with the parent:
 * a review subprocess has no business holding credentials for services it
 * does not call. For the full-access CLIs the allowlist bounds env-only
 * secrets; files on disk are within their granted reach.
 */
const ENV_ALLOWLIST_BASE = ["PATH", "HOME", "TMPDIR", "TERM", "LANG", "LC_ALL"];

const GOOGLE_FAMILY_ENV = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_CLOUD_LOCATION",
  "GOOGLE_GENAI_USE_VERTEXAI",
];

const ENV_ALLOWLIST_BY_CLI = {
  codex: ["OPENAI_API_KEY", "CODEX_HOME"],
  // agy (Antigravity) is Google's successor to the gemini CLI: same
  // credential family.
  gemini: GOOGLE_FAMILY_ENV,
  agy: GOOGLE_FAMILY_ENV,
};

function childEnv(cli) {
  const env = {};
  for (const key of [...ENV_ALLOWLIST_BASE, ...ENV_ALLOWLIST_BY_CLI[cli]]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

/**
 * The pinned argv per supported CLI. codex and gemini read the prompt from
 * stdin, never argv; agy cannot read stdin, so the prompt is its `-p`
 * value. Returns null for any unsupported CLI name so callers reject
 * before spawning.
 */
export function buildArgv(cli, prompt) {
  if (cli === "codex") {
    return {
      command: "codex",
      args: [
        "exec",
        "--dangerously-bypass-approvals-and-sandbox",
        "--skip-git-repo-check",
        "-",
      ],
    };
  }
  if (cli === "gemini") {
    return { command: "gemini", args: ["--approval-mode", "plan"] };
  }
  if (cli === "agy") {
    return { command: "agy", args: ["--dangerously-skip-permissions", "-p", prompt] };
  }
  return null;
}

/** True when the prompt fits inside PROMPT_CAP_BYTES, measured in bytes. */
export function promptWithinCap(prompt) {
  return Buffer.byteLength(prompt, "utf8") <= PROMPT_CAP_BYTES;
}

/**
 * Pass output at or under OUTPUT_CAP_BYTES through untouched; otherwise keep
 * the head, drop the tail, and append a truncation marker.
 */
export function truncateOutput(text) {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= OUTPUT_CAP_BYTES) return text;
  // Back off past any UTF-8 continuation bytes so the cut never splits a
  // multibyte character into a replacement-character tail.
  let end = OUTPUT_CAP_BYTES;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  const head = bytes.subarray(0, end).toString("utf8");
  return `${head}\n[output truncated at ${OUTPUT_CAP_BYTES} bytes]`;
}

const SUPPORTED_CLIS = ["codex", "gemini", "agy"];

/**
 * Machine-policy kill-switch, checked in both verbs before the per-repo
 * consent marker: policy outranks invitation. Any non-empty value disables
 * — unclear values land on off, fail closed. Deliberately absent from the
 * child env allowlists: the child never needs to see it.
 */
const KILL_SWITCH_VAR = "TEAM_DISABLE_CROSS_MODEL";

function killSwitchSet() {
  const value = process.env[KILL_SWITCH_VAR];
  return value !== undefined && value !== "";
}

function findOnPath(name) {
  const pathValue = process.env.PATH ?? "";
  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue;
    // A relative PATH entry (".", "relbin") names a different file per
    // resolver cwd (the child spawns from a scratch directory, not this
    // process's cwd), so only an absolute entry names the same file at vet
    // time and spawn time.
    if (!isAbsolute(dir)) continue;
    const candidate = join(dir, name);
    try {
      if (!statSync(candidate).isFile()) continue;
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Unreadable or missing entry: keep scanning; absence is the default.
    }
  }
  return null;
}

/**
 * Shared consent preflight for both verbs: `detect` answers unavailable
 * without it, `run` refuses pre-spawn without it. Any read error counts as
 * absent — fail closed.
 */
function markerPresent(repoRoot) {
  const marker = join(repoRoot, MARKER_RELATIVE_PATH);
  try {
    return existsSync(marker) && statSync(marker).isFile();
  } catch {
    return false;
  }
}

function detect(repoRoot) {
  if (killSwitchSet()) {
    // Disabled by machine policy: no marker check, no binary lookup, and no
    // binary claim of any kind.
    for (const cli of SUPPORTED_CLIS) {
      process.stdout.write(`${cli}: unavailable (disabled by ${KILL_SWITCH_VAR})\n`);
    }
    return 0;
  }
  if (!markerPresent(repoRoot)) {
    // Fail-closed and marker-first: no consent means no binary lookup and no
    // binary claim of any kind.
    for (const cli of SUPPORTED_CLIS) {
      process.stdout.write(
        `${cli}: unavailable (consent marker ${MARKER_RELATIVE_PATH} absent)\n`,
      );
    }
    return 0;
  }
  for (const cli of SUPPORTED_CLIS) {
    let found = null;
    try {
      found = findOnPath(cli);
    } catch {
      found = null;
    }
    process.stdout.write(
      found ? `${cli}: ready\n` : `${cli}: unavailable (binary not found on PATH)\n`,
    );
  }
  return 0;
}

function readStdin() {
  return new Promise((resolvePromise, rejectPromise) => {
    // Retain one byte past the prompt cap: enough for promptWithinCap to
    // reject an over-cap prompt, while an unbounded stdin stops growing
    // memory the moment it crosses the cap.
    const collector = boundedCollector(PROMPT_CAP_BYTES + 1);
    process.stdin.on("data", (chunk) => collector.push(chunk));
    process.stdin.on("end", () => resolvePromise(collector.text()));
    process.stdin.on("error", rejectPromise);
  });
}

function usage(message) {
  process.stderr.write(
    `${message}\n` +
      "usage: external-review.mjs detect <repo-root>\n" +
      "       external-review.mjs run <codex|gemini|agy> <repo-root> [timeout-ms]\n",
  );
  return 2;
}

/**
 * Collapse every line-break form — CR, LF, and the U+2028/U+2029 breaks
 * some renderers honor — to a single space. The caller contract says a
 * skip is exactly one line, and untrusted vendor text folded into a skip
 * reason must never break it.
 */
function collapseToOneLine(text) {
  return text.trim().replace(/[\r\n\u2028\u2029]+\s*/g, " ");
}

/**
 * Retain stream chunks only up to capBytes; everything past the cap is read
 * and dropped, so a runaway child can neither grow memory nor block on a
 * full pipe.
 */
function boundedCollector(capBytes) {
  const chunks = [];
  let retained = 0;
  return {
    push(chunk) {
      if (retained >= capBytes) return;
      const kept =
        chunk.length <= capBytes - retained ? chunk : chunk.subarray(0, capBytes - retained);
      chunks.push(kept);
      retained += kept.length;
    },
    text() {
      return Buffer.concat(chunks).toString("utf8");
    },
  };
}

async function run(cli, repoRoot, timeoutMs) {
  // All four guards exit before any spawn: a rejected attempt consumes
  // nothing, and no diff ever leaves the machine without standing consent.
  if (!SUPPORTED_CLIS.includes(cli)) {
    return usage(`unknown CLI "${cli}"`);
  }
  if (killSwitchSet()) {
    process.stderr.write(`${KILL_SWITCH_VAR} is set: cross-model calls are disabled on this machine\n`);
    return 4;
  }
  if (!markerPresent(repoRoot)) {
    process.stderr.write(
      `consent marker ${MARKER_RELATIVE_PATH} absent under ${repoRoot}: refusing to run\n`,
    );
    return 3;
  }
  const prompt = await readStdin();
  if (!promptWithinCap(prompt)) {
    return usage(`prompt exceeds ${PROMPT_CAP_BYTES} bytes`);
  }

  const { command, args } = buildArgv(cli, prompt);
  // Resolve here and spawn the absolute path, so what runs is exactly what
  // this process saw — never a second PATH walk at spawn time.
  const resolved = findOnPath(command);
  if (resolved === null) {
    process.stdout.write(`skip: ${cli} not found on PATH\n`);
    return 0;
  }
  // codex and agy run full-access in the repo cwd — the consent marker
  // grants exactly that — so they can read the codebase they review.
  // gemini stays contained: plan mode bounds writes, and an empty scratch
  // cwd (never repoRoot) keeps repo-resident files (an untracked .env,
  // .git/config, agent context files) out of its reach.
  const scratchDir =
    cli === "gemini" ? mkdtempSync(join(tmpdir(), "cross-model-review-")) : null;
  return new Promise((resolvePromise) => {
    const child = spawn(resolved, args, {
      cwd: scratchDir ?? repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv(cli),
      // Own process group, so the timeout kill can reach grandchildren.
      detached: true,
    });

    // A detached child survives its parent's death, so reap the whole
    // process group when a fatal signal or an interrupt ends this process
    // early. Once the child has exited, its PID (and so the group ID) may
    // be recycled by an unrelated process — the reap no-ops from then on.
    let childExited = false;
    const reapChildGroup = () => {
      if (childExited) return;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // Group already gone: nothing left to reap.
      }
    };
    process.once("exit", reapChildGroup);
    for (const [signal, exitCode] of [
      ["SIGTERM", 143],
      ["SIGINT", 130],
    ]) {
      process.once(signal, () => {
        reapChildGroup();
        process.exit(exitCode);
      });
    }

    // Retain one byte past the stdout cap so truncateOutput can tell an
    // exactly-at-cap output (passes untouched) from an over-cap one (gets
    // the truncation marker).
    const stdoutCollector = boundedCollector(OUTPUT_CAP_BYTES + 1);
    const stderrCollector = boundedCollector(STDERR_CAP_BYTES);
    let settled = false;
    const settle = (report) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (scratchDir) {
        try {
          rmSync(scratchDir, { recursive: true, force: true });
        } catch {
          // Best-effort cleanup of an empty tmpdir entry; the report matters more.
        }
      }
      report();
      resolvePromise(0);
    };

    // Settle on the timer itself, not on the child's close event: a killed
    // shell can leave a grandchild holding the stdio pipes open, which would
    // delay close (and the skip report) until that grandchild exits.
    const timer = setTimeout(() => {
      try {
        // Negative PID: kill the whole process group, grandchildren included.
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
      settle(() => {
        process.stdout.write(`skip: ${cli} timed out after ${timeoutMs} ms\n`);
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdoutCollector.push(chunk));
    child.stderr.on("data", (chunk) => stderrCollector.push(chunk));

    child.on("error", (error) => {
      childExited = true;
      settle(() => {
        process.stdout.write(
          `skip: ${cli} failed to start (${collapseToOneLine(error.message)})\n`,
        );
      });
    });

    child.on("close", (code) => {
      childExited = true;
      settle(() => {
        if (code !== 0) {
          const reason = collapseToOneLine(stderrCollector.text());
          // The fence keeps vendor stderr reading as quoted diagnostics,
          // never as the runner's own protocol lines.
          process.stdout.write(
            `skip: ${cli} exited with code ${code}${reason ? `: [vendor stderr] ${reason}` : ""}\n`,
          );
          return;
        }
        // Only stdout is the review; gemini writes progress noise to stderr.
        const output = stdoutCollector.text();
        if (output.trim() === "") {
          // Silence from a healthy CLI must never read as agreement.
          process.stdout.write(`skip: ${cli} produced no output\n`);
          return;
        }
        process.stdout.write(truncateOutput(output));
      });
    });

    // A child that exits without draining stdin raises EPIPE here; that is
    // its exit code's story to tell, not a crash. agy already holds the
    // prompt in argv and must never block on stdin, so its stdin closes
    // unwritten.
    child.stdin.on("error", () => {});
    if (cli !== "agy") child.stdin.write(prompt);
    child.stdin.end();
  });
}

// CLI entry point — runs only when executed directly, not when imported by a
// test. process.argv[1] is the test runner under `bun test`, so the import is
// side-effect free.
function invokedDirectly() {
  if (!process.argv[1]) return false;
  let argvPath = process.argv[1];
  try {
    // Node realpaths import.meta.url but leaves argv[1] as typed, so a
    // symlinked invocation path (script/dev-install-* install the plugin as
    // a symlink) would never compare equal without this realpath.
    argvPath = realpathSync(argvPath);
  } catch {
    // Unresolvable argv[1]: fall back to comparing the literal path.
  }
  return import.meta.url === pathToFileURL(argvPath).href;
}

if (invokedDirectly()) {
  const [, , verb, ...rest] = process.argv;
  if (verb === "detect" && rest.length === 1) {
    process.exit(detect(rest[0]));
  } else if (verb === "run" && (rest.length === 2 || rest.length === 3)) {
    const timeoutMs = rest.length === 3 ? Number(rest[2]) : TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      process.exit(usage(`invalid timeout-ms "${rest[2]}"`));
    }
    process.exit(await run(rest[0], rest[1], timeoutMs));
  } else {
    process.exit(usage("missing or malformed arguments"));
  }
}
