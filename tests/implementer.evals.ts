// tests/implementer.evals.ts
//
// Periodic eval for the implementer agent. The implementer turns a frozen
// plan + a planted FAILING acceptance test into a passing slice. The eval
// initializes a git-repo workdir from a checked-in scaffold, runs the agent,
// then scores by RUNNING the planted acceptance test in the workdir — not by
// judging transcript prose.
//
// Deterministic mock seam: under EVALS_MOCK_AGENT the real agent does not
// touch the filesystem, so the eval applies the file edits described by the
// replayed transcript's Write/Edit tool calls to the workdir before running
// the acceptance test. This keeps the verification path deterministic while
// faithfully replaying the edit the transcript claims.
//
//   EVALS_MOCK_AGENT=<path>   replay a recorded NDJSON transcript
//
// No-op guard: when the acceptance test is already green, the agent must make
// no spurious change — the eval asserts the acceptance test file's bytes are
// unchanged.

import { afterAll } from "bun:test";
import { expect } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

import { EvalCollector, assertNoBudgetRegressions } from "./helpers/eval-store";
import { loadFixture } from "./helpers/fixtures";
import { runAgentTest } from "./helpers/session-runner";
import type { ToolCall } from "./helpers/session-runner";
import { testIfSelected } from "./helpers/touchfiles";

const collector = new EvalCollector("e2e");

// Generous timeout: a real implementer run edits files and runs tests.
const IMPLEMENTER_TIMEOUT_MS = 600_000;

const FIXTURE_ROOT = "evals/fixtures/implementer";
// Named without a `.test.`/`.spec.` suffix so the repo's own `bun test`
// auto-discovery never picks up the fixture scaffold's planted test. The
// eval drives it explicitly via `node`.
const ACCEPTANCE_TEST = "test/acceptance.js";

// Initialize a git-repo workdir from the fixture's `repo/` scaffold so the
// implementer has a real, committed baseline to work against.
function initRepoWorkdir(testCase: string): string {
  const scaffold = join(FIXTURE_ROOT, testCase, "repo");
  const workDir = mkdtempSync(join(tmpdir(), `implementer-${testCase}-`));
  cpSync(scaffold, workDir, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: workDir });
  execFileSync("git", ["config", "user.email", "evals@example.com"], { cwd: workDir });
  execFileSync("git", ["config", "user.name", "Evals"], { cwd: workDir });
  execFileSync("git", ["add", "-A"], { cwd: workDir });
  execFileSync("git", ["commit", "-q", "-m", "baseline"], { cwd: workDir });
  return workDir;
}

// Apply a replayed transcript's Write tool calls to the workdir. Only used on
// the mock path, where the real agent never touched the filesystem.
function applyWriteToolCalls(workDir: string, toolCalls: ToolCall[]): void {
  for (const call of toolCalls) {
    if (call.tool !== "Write" && call.tool !== "Edit") continue;
    const input = call.input as Record<string, unknown>;
    const filePath = input.file_path;
    if (typeof filePath !== "string") continue;
    // Containment guard: a replayed transcript is untrusted input. Reject any
    // path that resolves outside workDir (e.g. `../../etc/...` or absolute).
    const abs = resolve(workDir, filePath);
    if (!abs.startsWith(resolve(workDir) + sep)) continue;
    if (call.tool === "Write") {
      const content = typeof input.content === "string" ? input.content : "";
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf8");
    } else {
      const oldString = input.old_string;
      const newString = input.new_string;
      if (typeof oldString === "string" && typeof newString === "string") {
        const current = readFileSync(abs, "utf8");
        writeFileSync(abs, current.replace(oldString, newString), "utf8");
      }
    }
  }
}

function isMocked(): boolean {
  return (
    process.env.EVALS_MOCK_AGENT !== undefined &&
    process.env.EVALS_MOCK_AGENT !== ""
  );
}

// Run the planted acceptance test in the workdir. Returns true iff it passes.
function acceptanceTestPasses(workDir: string): boolean {
  try {
    execFileSync("node", [ACCEPTANCE_TEST], { cwd: workDir, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

testIfSelected(
  "implementer-implements-slice",
  async () => {
    const fixture = loadFixture("implementer", "implements-slice");
    const workDir = initRepoWorkdir("implements-slice");

    try {
      // Sanity: the planted test must FAIL before the agent runs, otherwise
      // the eval would pass vacuously.
      expect(acceptanceTestPasses(workDir)).toBe(false);

      const prompt =
        "You are the implementer. Execute the frozen slice below in this " +
        "git-repo workspace. Make the planted acceptance test pass with the " +
        "minimal implementation. Do NOT modify the acceptance test.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 12,
        timeout: IMPLEMENTER_TIMEOUT_MS,
        testName: "implementer-implements-slice",
        // The implementer MUST write src/sum.js. In headless CI the agent runs
        // in permissionMode: default, so without bypass its Write/Bash calls
        // stall on an unanswerable permission prompt and the run dies with
        // error_max_turns. The workdir is an ephemeral git sandbox.
        bypassPermissions: true,
      });

      // On the deterministic mock path, apply the transcript's file edits.
      if (isMocked()) {
        applyWriteToolCalls(workDir, result.toolCalls);
      }

      const passes = acceptanceTestPasses(workDir);
      const passed = result.exitReason === "success" && passes;

      collector.addTest({
        name: "implementer-implements-slice",
        suite: "implementer-e2e",
        tier: "e2e",
        passed,
        duration_ms: result.duration,
        cost_usd: result.costEstimate.estimatedCost,
        transcript: result.transcript,
        judge_scores: { detection_rate: passes ? 1 : 0 },
        exit_reason: result.exitReason,
        model: result.model,
        first_response_ms: result.firstResponseMs,
        max_inter_turn_ms: result.maxInterTurnMs,
      });

      expect(result.exitReason).toBe("success");
      expect(passes).toBe(true);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  },
  IMPLEMENTER_TIMEOUT_MS,
);

testIfSelected(
  "implementer-noop-when-green",
  async () => {
    const fixture = loadFixture("implementer", "noop-when-green");
    const workDir = initRepoWorkdir("noop-when-green");
    const testFilePath = join(workDir, ACCEPTANCE_TEST);

    try {
      // The slice is already complete: the planted test passes before the run.
      expect(acceptanceTestPasses(workDir)).toBe(true);
      const before = readFileSync(testFilePath);

      const prompt =
        "You are the implementer. The frozen slice below is already complete " +
        "and its acceptance test already passes. Make NO spurious change and " +
        "do NOT modify the acceptance test.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 12,
        timeout: IMPLEMENTER_TIMEOUT_MS,
        testName: "implementer-noop-when-green",
        // Same headless-CI permission bypass as the implements-slice case.
        bypassPermissions: true,
      });

      if (isMocked()) {
        applyWriteToolCalls(workDir, result.toolCalls);
      }

      // No-op guard: the acceptance test file's bytes must be unchanged.
      const after = readFileSync(testFilePath);
      const testUnchanged = before.equals(after);
      const stillPasses = acceptanceTestPasses(workDir);
      const passed =
        result.exitReason === "success" && testUnchanged && stillPasses;

      collector.addTest({
        name: "implementer-noop-when-green",
        suite: "implementer-e2e",
        tier: "e2e",
        passed,
        duration_ms: result.duration,
        cost_usd: result.costEstimate.estimatedCost,
        transcript: result.transcript,
        judge_scores: { detection_rate: testUnchanged && stillPasses ? 1 : 0 },
        exit_reason: result.exitReason,
        model: result.model,
        first_response_ms: result.firstResponseMs,
        max_inter_turn_ms: result.maxInterTurnMs,
      });

      expect(result.exitReason).toBe("success");
      expect(testUnchanged).toBe(true);
      expect(stillPasses).toBe(true);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  },
  IMPLEMENTER_TIMEOUT_MS,
);

afterAll(async () => {
  await collector.finalize();
  assertNoBudgetRegressions(collector);
});
