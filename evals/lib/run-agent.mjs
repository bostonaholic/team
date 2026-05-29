// evals/lib/run-agent.mjs
//
// Subprocess wrapper around `claude -p --output-format stream-json`.
// All `claude` CLI knowledge lives here so future CLI drift is a
// one-file patch (per design risk note). The shared `spawnClaude`
// helper is exported so judge.mjs can use the same code path.
//
// Mock seam:
//   EVALS_MOCK_AGENT=<path>
//     The file at <path> is read and used as the agent output. When the
//     path ends in `.sh`, the file is executed (with `EVALS_CASE_NAME`
//     exported) and its stdout used as the agent output. If the value
//     is set but the file does not exist, runAgent fails fast with a
//     descriptive error pointing at the misconfiguration.
//
// Timeout: EVALS_TIMEOUT (seconds), default 120. On expiry the child
// is killed and the result records exit_reason='timeout'.
//
// Fixture size cap: input.md is rejected at runtime when > 50 KB,
// matching the gate's static check.

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const DEFAULT_TIMEOUT_SEC = 120;

// 50 KB cap on fixture / rubric / ground-truth bodies; the gate enforces
// this statically, the runtime enforces it again so a hand-edited file
// past the cap can't bypass the gate.
export const FIXTURE_SIZE_CAP = 51200;

/**
 * Run the named agent against the fixture input.
 * Returns { output, stderr, exitCode, exitReason } where exitReason is
 * 'ok' | 'timeout' | 'exit_code_N' | 'spawn_error'.
 */
export async function runAgent({ agentName, inputPath, caseName, env = {} }) {
  if (!agentName) throw new Error("runAgent: agentName is required");
  if (!inputPath) throw new Error("runAgent: inputPath is required");

  const timeoutSec = parseInt(
    env.EVALS_TIMEOUT || process.env.EVALS_TIMEOUT || String(DEFAULT_TIMEOUT_SEC),
    10,
  );

  const mockPath = env.EVALS_MOCK_AGENT || process.env.EVALS_MOCK_AGENT;
  if (mockPath) {
    return runMockAgent({ mockPath, caseName, timeoutSec });
  }

  // Real path: spawn `claude -p` with stdin from inputPath.
  return runClaude({ agentName, inputPath, caseName, timeoutSec, env });
}

/**
 * Validate that an env var points at an existing readable file.
 * Returns null on success, or throws with a clear, actionable error.
 */
function assertMockEnvIsFile(envName, mockPath) {
  try {
    const s = statSync(mockPath);
    if (!s.isFile()) {
      throw new Error(
        `${envName} must be a path to an existing file (got: '${mockPath}'). ` +
          `Set to /path/to/mock-output.json or unset.`,
      );
    }
  } catch (err) {
    if (err && err.code === "ENOENT") {
      throw new Error(
        `${envName} must be a path to an existing file (got: '${mockPath}'). ` +
          `Set to /path/to/mock-output.json or unset.`,
      );
    }
    throw err;
  }
}

function runMockAgent({ mockPath, caseName, timeoutSec }) {
  // Fail fast on misconfiguration (e.g. EVALS_MOCK_AGENT=1).
  assertMockEnvIsFile("EVALS_MOCK_AGENT", mockPath);

  // Executable mock: run it as a shell script so the test can vary
  // behavior by case name via EVALS_CASE_NAME.
  if (mockPath.endsWith(".sh")) {
    const result = spawnSync("bash", [mockPath], {
      env: { ...process.env, EVALS_CASE_NAME: caseName || "" },
      timeout: timeoutSec * 1000,
      encoding: "utf8",
    });
    if (result.error && result.error.code === "ETIMEDOUT") {
      return Promise.resolve({
        output: result.stdout || "",
        stderr: result.stderr || "",
        exitCode: null,
        exitReason: "timeout",
      });
    }
    if (result.signal === "SIGTERM" || result.signal === "SIGKILL") {
      return Promise.resolve({
        output: result.stdout || "",
        stderr: result.stderr || "",
        exitCode: null,
        exitReason: "timeout",
      });
    }
    const code = result.status;
    return Promise.resolve({
      output: result.stdout || "",
      stderr: result.stderr || "",
      exitCode: code,
      exitReason: code === 0 ? "ok" : `exit_code_${code}`,
    });
  }
  // Static-file mock: just read the contents.
  const out = readFileSync(mockPath, "utf8");
  return Promise.resolve({
    output: out,
    stderr: "",
    exitCode: 0,
    exitReason: "ok",
  });
}

function runClaude({ agentName, inputPath, caseName, timeoutSec, env }) {
  // Enforce the 50 KB fixture cap at runtime before paying for a model call.
  let inputBody;
  try {
    const s = statSync(inputPath);
    if (s.size > FIXTURE_SIZE_CAP) {
      return Promise.resolve({
        output: "",
        stderr: `fixture too large: ${inputPath} is ${s.size} bytes (>${FIXTURE_SIZE_CAP} cap)`,
        exitCode: null,
        exitReason: "spawn_error",
      });
    }
    inputBody = readFileSync(inputPath, "utf8");
  } catch (err) {
    return Promise.resolve({
      output: "",
      stderr: String(err.message || err),
      exitCode: null,
      exitReason: "spawn_error",
    });
  }

  return spawnClaude(["-p", "--output-format", "stream-json"], inputBody, {
    timeoutSec,
    extraEnv: {
      ...env,
      EVALS_CASE_NAME: caseName || "",
      EVALS_AGENT_NAME: agentName || "",
    },
  });
}

/**
 * Spawn `claude` with the given argv, pipe `stdinPayload` to its stdin,
 * and resolve with { output, stderr, exitCode, exitReason }. This is the
 * single point of CLI drift — both the agent runner (above) and the
 * judge (judge.mjs) call through here so a `claude` CLI change is a
 * one-file patch.
 *
 * opts:
 *   timeoutSec  hard kill after this many seconds (default 120)
 *   extraEnv    merged onto process.env for the child
 */
export function spawnClaude(args, stdinPayload, opts = {}) {
  // Use `??` not `||` so a deliberate `0` (or future caller passing `null`)
  // doesn't silently get rewritten to the 120s default.
  const timeoutSec = opts.timeoutSec ?? DEFAULT_TIMEOUT_SEC;
  const extraEnv = opts.extraEnv || {};
  return new Promise((resolve) => {
    const child = spawn("claude", args, {
      env: { ...process.env, ...extraEnv },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // Child already gone; nothing to do.
      }
    }, timeoutSec * 1000);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        output: stdout,
        stderr: stderr + String(err.message || err),
        exitCode: null,
        exitReason: "spawn_error",
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (timedOut) {
        resolve({
          output: stdout,
          stderr,
          exitCode: null,
          exitReason: "timeout",
        });
        return;
      }
      resolve({
        output: stdout,
        stderr,
        exitCode: code,
        exitReason: code === 0 ? "ok" : `exit_code_${code}`,
      });
    });

    try {
      if (stdinPayload !== undefined && stdinPayload !== null) {
        child.stdin.write(stdinPayload);
      }
      child.stdin.end();
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        try {
          child.kill("SIGKILL");
        } catch {
          // Best effort.
        }
        resolve({
          output: "",
          stderr: String(err.message || err),
          exitCode: null,
          exitReason: "spawn_error",
        });
      }
    }
  });
}
