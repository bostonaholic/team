/**
 * skill-harness.ts — drive a SKILL.md procedure through a real (or mocked)
 * agent session and capture the transcript for assertion.
 *
 * A skill is just a procedure document. To exercise it we read the SKILL.md
 * body, append the task, and delegate to `runAgentTest` — the same spawner the
 * agent evals use, so mock mode (EVALS_MOCK_AGENT) works identically here.
 * Callers can pipe the returned `output` into `judgeQuality`.
 */

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgentTest, type SkillTestResult } from "./session-runner.ts";

export interface SkillHarnessOptions {
  /** Absolute path to the SKILL.md under test. */
  skillPath: string;
  /** The user task / prompt to drive the skill. */
  task: string;
  /** Max conversation turns before forcing a stop. */
  maxTurns?: number;
  /** Timeout in milliseconds. */
  timeout?: number;
  /** Human-readable test name for logs. */
  testName?: string;
  /** Working directory for the spawned agent (defaults to a fresh tmp dir). */
  workingDirectory?: string;
}

const PROMPT_BRIDGE = "\n\nApply the procedure above to this task:\n\n";

export async function runSkillHarness(
  opts: SkillHarnessOptions,
): Promise<SkillTestResult> {
  const { skillPath, task, maxTurns, timeout, testName, workingDirectory } =
    opts;

  const skillBody = readFileSync(skillPath, "utf8");
  const prompt = skillBody + PROMPT_BRIDGE + task;
  const workdir =
    workingDirectory ?? mkdtempSync(join(tmpdir(), "skill-harness-run-"));

  return await runAgentTest({
    prompt,
    workingDirectory: workdir,
    maxTurns,
    timeout,
    testName,
  });
}
