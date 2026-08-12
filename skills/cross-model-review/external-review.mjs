#!/usr/bin/env node

/**
 * Cross-vendor review runner for the cross-model-review skill.
 *
 * Two verbs, both fail-closed:
 *
 *     node <skill-dir>/external-review.mjs detect <repo-root>
 *     node <skill-dir>/external-review.mjs run <cli> <repo-root> [timeout-ms]
 *
 * `detect` reports per-CLI availability. The consent marker
 * `.team/cross-model-review` is checked before any binary lookup: without it
 * the answer is unavailable and no binary claim is made, so a repo that never
 * opted in never even learns what sits on PATH. `run` reads the review prompt
 * from stdin and invokes the named CLI with a pinned read-only argv — codex
 * gets the prompt on stdin (then EOF, which defeats the stdin-block hang),
 * gemini gets it as the `-p` value. Guard failures (unknown CLI, prompt over
 * the cap) are usage errors that exit before any child process spawns, so a
 * rejected attempt consumes nothing.
 *
 * The trailing [timeout-ms] argument exists for the accelerated-timeout test
 * only; the skill's documented invocation never passes it. No environment
 * knobs, no relative imports — the script runs from any install path.
 *
 * The pure pieces below are exported for L1 tests
 * (tests/cross-model-review.test.ts); the CLI runs only when executed
 * directly, so `bun test` imports are side-effect free.
 */

import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";
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
 * The pinned read-only argv per supported CLI. Codex reads the prompt from
 * stdin (`-`); gemini takes it as the `-p` value. Returns null for any
 * unsupported CLI name so callers reject before spawning.
 */
export function buildArgv(cli, prompt) {
  if (cli === "codex") {
    return {
      command: "codex",
      args: ["exec", "-s", "read-only", "--skip-git-repo-check", "-"],
    };
  }
  if (cli === "gemini") {
    return { command: "gemini", args: ["--approval-mode", "plan", "-p", prompt] };
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
  const head = bytes.subarray(0, OUTPUT_CAP_BYTES).toString("utf8");
  return `${head}\n[output truncated at ${OUTPUT_CAP_BYTES} bytes]`;
}

const SUPPORTED_CLIS = ["codex", "gemini"];

function findOnPath(name) {
  const pathValue = process.env.PATH ?? "";
  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue;
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

function detect(repoRoot) {
  const marker = join(repoRoot, MARKER_RELATIVE_PATH);
  let markerPresent = false;
  try {
    markerPresent = existsSync(marker) && statSync(marker).isFile();
  } catch {
    markerPresent = false;
  }
  if (!markerPresent) {
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
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", rejectPromise);
  });
}

function usage(message) {
  process.stderr.write(
    `${message}\n` +
      "usage: external-review.mjs detect <repo-root>\n" +
      "       external-review.mjs run <codex|gemini> <repo-root> [timeout-ms]\n",
  );
  return 2;
}

async function run(cli, repoRoot, timeoutMs) {
  // Both guards exit before any spawn: a rejected attempt consumes nothing.
  if (!SUPPORTED_CLIS.includes(cli)) {
    return usage(`unknown CLI "${cli}"`);
  }
  const prompt = await readStdin();
  if (!promptWithinCap(prompt)) {
    return usage(`prompt exceeds ${PROMPT_CAP_BYTES} bytes`);
  }

  const { command, args } = buildArgv(cli, prompt);
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;
    const settle = (report) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      report();
      resolvePromise(0);
    };

    // Settle on the timer itself, not on the child's close event: a killed
    // shell can leave a grandchild holding the stdio pipes open, which would
    // delay close (and the skip report) until that grandchild exits.
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      settle(() => {
        process.stdout.write(`skip: ${cli} timed out after ${timeoutMs} ms\n`);
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

    child.on("error", (error) => {
      settle(() => {
        process.stdout.write(`skip: ${cli} failed to start (${error.message})\n`);
      });
    });

    child.on("close", (code) => {
      settle(() => {
        if (code !== 0) {
          const reason = Buffer.concat(stderrChunks).toString("utf8").trim();
          process.stdout.write(
            `skip: ${cli} exited with code ${code}${reason ? `: ${reason}` : ""}\n`,
          );
          return;
        }
        // Only stdout is the review; gemini writes progress noise to stderr.
        const output = Buffer.concat(stdoutChunks).toString("utf8");
        process.stdout.write(truncateOutput(output));
      });
    });

    // A child that exits without draining stdin raises EPIPE here; that is
    // its exit code's story to tell, not a crash.
    child.stdin.on("error", () => {});
    if (cli === "codex") child.stdin.write(prompt);
    child.stdin.end();
  });
}

// CLI entry point — runs only when executed directly, not when imported by a
// test. process.argv[1] is the test runner under `bun test`, so the import is
// side-effect free.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
