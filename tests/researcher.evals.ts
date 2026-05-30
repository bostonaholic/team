// tests/researcher.evals.ts
//
// Judgment-tier eval for the researcher agent. The happy case is scored with
// the generic `judgeQuality` rubric (clarity / completeness / actionability);
// the isolation edge is scored deterministically with `outcomeJudge`. Mirrors
// code-reviewer.evals.ts.
//
// The researcher investigates a real codebase, so each case runs in a tiny
// throwaway git-repo workdir (a fresh `git init` so the agent has a repo to
// operate in without touching this checkout).
//
// Self-eval recursion guard: input.md is a FROZEN questions.md, never live
// pipeline output.
//
// Mock seams (offline, no key, no cost):
//   EVALS_MOCK_AGENT=<path>   replay a recorded NDJSON transcript
//   EVALS_MOCK_JUDGE=<path>   replay a recorded judge verdict JSON

import { afterAll } from "bun:test";
import { expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EvalCollector, assertNoBudgetRegressions } from "./helpers/eval-store";
import { loadFixture } from "./helpers/fixtures";
import { judgeQuality, outcomeJudge } from "./helpers/llm-judge";
import { runAgentTest } from "./helpers/session-runner";
import { testIfSelected } from "./helpers/touchfiles";

const collector = new EvalCollector("e2e");

const MIN_QUALITY = 3;

const PROMPT =
  "You are the isolated researcher. Answer each question below from the actual " +
  "codebase with file:line evidence. You see ONLY these questions — never the " +
  "user's task framing — so keep your findings grounded in the code.\n\n";

// Create a throwaway git-repo workdir so the researcher has a repo to operate
// in. Fails loud if git init fails (no silent zero-score path).
function makeRepoWorkdir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

testIfSelected(
  "researcher-answers-from-questions",
  async () => {
    const fixture = loadFixture("researcher", "answers-from-questions");
    const workDir = makeRepoWorkdir("researcher-e2e-");

    try {
      const result = await runAgentTest({
        prompt: PROMPT + fixture.body,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "researcher-answers-from-questions",
      });

      const outcome = outcomeJudge(fixture.groundTruth, result.output);
      const quality = await judgeQuality(result.output);

      const passed =
        result.exitReason === "success" &&
        quality.clarity >= MIN_QUALITY &&
        quality.completeness >= MIN_QUALITY &&
        quality.actionability >= MIN_QUALITY;

      collector.addTest({
        name: "researcher-answers-from-questions",
        suite: "researcher-e2e",
        tier: "e2e",
        passed,
        duration_ms: result.duration,
        cost_usd: result.costEstimate.estimatedCost,
        transcript: result.transcript,
        judge_scores: {
          clarity: quality.clarity,
          completeness: quality.completeness,
          actionability: quality.actionability,
          detection_rate: outcome.detection_rate,
        },
        exit_reason: result.exitReason,
        model: result.model,
        first_response_ms: result.firstResponseMs,
        max_inter_turn_ms: result.maxInterTurnMs,
      });

      expect(result.exitReason).toBe("success");
      expect(quality.clarity).toBeGreaterThanOrEqual(MIN_QUALITY);
      expect(quality.completeness).toBeGreaterThanOrEqual(MIN_QUALITY);
      expect(quality.actionability).toBeGreaterThanOrEqual(MIN_QUALITY);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  },
  240_000,
);

testIfSelected(
  "researcher-no-task-leak",
  async () => {
    const fixture = loadFixture("researcher", "no-task-leak");
    const workDir = makeRepoWorkdir("researcher-leak-e2e-");

    try {
      const result = await runAgentTest({
        prompt: PROMPT + fixture.body,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "researcher-no-task-leak",
      });

      // Deterministic isolation guard: the user's task-framing phrase (the
      // planted detection_hint) must NOT appear in the findings, so its bug id
      // must land in outcome.missed.
      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      const passed =
        result.exitReason === "success" &&
        outcome.missed.includes("task-framing-leak") &&
        outcome.detected.length === 0;

      collector.addTest({
        name: "researcher-no-task-leak",
        suite: "researcher-e2e",
        tier: "e2e",
        passed,
        duration_ms: result.duration,
        cost_usd: result.costEstimate.estimatedCost,
        transcript: result.transcript,
        judge_scores: { detection_rate: outcome.detection_rate },
        exit_reason: result.exitReason,
        model: result.model,
        first_response_ms: result.firstResponseMs,
        max_inter_turn_ms: result.maxInterTurnMs,
      });

      expect(result.exitReason).toBe("success");
      expect(outcome.missed).toContain("task-framing-leak");
      expect(outcome.detected.length).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  },
  240_000,
);

afterAll(async () => {
  await collector.finalize();
  assertNoBudgetRegressions(collector);
});
