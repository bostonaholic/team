// evals/lib/run-agent.mjs
//
// Subprocess wrapper around `claude -p --output-format stream-json`.
// All `claude` CLI knowledge lives here so future CLI drift is a
// one-file patch (per design risk note).
//
// Mock seam:
//   EVALS_MOCK_AGENT=<path>
//     When the path ends in `.sh`, the file is executed (with
//     `EVALS_CASE_NAME` exported) and its stdout used as the agent
//     output. Otherwise the file is read verbatim. This is the seam
//     the slice 1 walking-skeleton test uses.
//
// Timeout: EVALS_TIMEOUT (seconds), default 120. On expiry the child
// is killed and the result records exit_reason='timeout'.

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DEFAULT_TIMEOUT_SEC = 120;

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

function runMockAgent({ mockPath, caseName, timeoutSec }) {
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
  return new Promise((resolve) => {
    const args = ["-p", "--output-format", "stream-json"];
    const child = spawn("claude", args, {
      env: {
        ...process.env,
        ...env,
        EVALS_CASE_NAME: caseName || "",
        EVALS_AGENT_NAME: agentName || "",
      },
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

    // Feed input.md on stdin so the agent receives it as the user prompt.
    try {
      const input = readFileSync(inputPath, "utf8");
      child.stdin.write(input);
      child.stdin.end();
    } catch (err) {
      // Surface read errors via the same return shape rather than throwing.
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
