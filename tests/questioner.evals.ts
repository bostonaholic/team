// tests/questioner.evals.ts
//
// Judgment-tier eval for the questioner agent. The happy case is scored with
// the generic `judgeQuality` rubric (clarity / completeness / actionability);
// the leakage edge is scored deterministically with `outcomeJudge`. Mirrors
// code-reviewer.evals.ts.
//
// Self-eval recursion guard: input.md is a raw task description (synthetic
// prompt), never live pipeline output.
//
// Mock seams (offline, no key, no cost):
//   EVALS_MOCK_AGENT=<path>   replay a recorded NDJSON transcript
//   EVALS_MOCK_JUDGE=<path>   replay a recorded judge verdict JSON

import { afterAll } from "bun:test";
import { expect } from "bun:test";
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
  "You are the questioner. Decompose the raw task below into a task statement " +
  "plus concrete research questions for an isolated researcher. Keep the " +
  "questions open and unbiased — do not pre-bake a chosen solution into the " +
  "questions.\n\n";

testIfSelected(
  "questioner-decomposes-intent",
  async () => {
    const fixture = loadFixture("questioner", "decomposes-intent");
    const workDir = mkdtempSync(join(tmpdir(), "questioner-e2e-"));

    try {
      const result = await runAgentTest({
        prompt: PROMPT + fixture.body,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "questioner-decomposes-intent",
      });

      const outcome = outcomeJudge(fixture.groundTruth, result.output);
      const quality = await judgeQuality(result.output);

      const passed =
        result.exitReason === "success" &&
        quality.clarity >= MIN_QUALITY &&
        quality.completeness >= MIN_QUALITY &&
        quality.actionability >= MIN_QUALITY;

      collector.addTest({
        name: "questioner-decomposes-intent",
        suite: "questioner-e2e",
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
  "questioner-no-intent-leak",
  async () => {
    const fixture = loadFixture("questioner", "no-intent-leak");
    const workDir = mkdtempSync(join(tmpdir(), "questioner-leak-e2e-"));

    try {
      const result = await runAgentTest({
        prompt: PROMPT + fixture.body,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "questioner-no-intent-leak",
      });

      // Deterministic research-isolation guard: the pre-chosen-solution phrase
      // (the planted detection_hint) must NOT appear in the questions, so its
      // bug id must land in outcome.missed.
      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      const passed =
        result.exitReason === "success" &&
        outcome.missed.includes("intent-leak") &&
        outcome.detected.length === 0;

      collector.addTest({
        name: "questioner-no-intent-leak",
        suite: "questioner-e2e",
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
      expect(outcome.missed).toContain("intent-leak");
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
