// tests/test-architect.evals.ts
//
// Detection-rate eval for the test-architect agent. Scored purely with the
// deterministic `outcomeJudge` — no LLM judge call. Mirrors
// code-reviewer.evals.ts.
//
// Mock seam (offline, no key, no cost):
//   EVALS_MOCK_AGENT=<path>   replay a recorded NDJSON transcript

import { afterAll } from "bun:test";
import { expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EvalCollector, assertNoBudgetRegressions } from "./helpers/eval-store";
import { loadFixture } from "./helpers/fixtures";
import { outcomeJudge } from "./helpers/llm-judge";
import { runAgentTest } from "./helpers/session-runner";
import { testIfSelected } from "./helpers/touchfiles";

const collector = new EvalCollector("e2e");

testIfSelected(
  "test-architect-covers-branch",
  async () => {
    const fixture = loadFixture("test-architect", "covers-branch");
    const workDir = mkdtempSync(join(tmpdir(), "test-architect-e2e-"));

    try {
      const prompt =
        "You are a test-architect. Identify the untested branch(es) and " +
        "describe the acceptance test(s) needed to cover them.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "test-architect-covers-branch",
      });

      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      const passed = result.exitReason === "success" && outcome.passes_minimum;

      collector.addTest({
        name: "test-architect-covers-branch",
        suite: "test-architect-e2e",
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
      expect(outcome.detection_rate).toBeGreaterThanOrEqual(
        fixture.groundTruth.minimum_detection,
      );
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  },
  240_000,
);

testIfSelected(
  "test-architect-empty-input",
  async () => {
    const fixture = loadFixture("test-architect", "empty-input");
    const workDir = mkdtempSync(join(tmpdir(), "test-architect-empty-e2e-"));

    try {
      const prompt =
        "You are a test-architect. Identify the untested branch(es) and " +
        "describe the acceptance test(s) needed to cover them.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "test-architect-empty-input",
      });

      // Empty input must produce graceful output that does NOT fabricate the
      // planted coverage gap — so the detection score must NOT pass.
      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      const passed =
        result.exitReason === "success" && outcome.passes_minimum === false;

      collector.addTest({
        name: "test-architect-empty-input",
        suite: "test-architect-e2e",
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
      expect(outcome.passes_minimum).toBe(false);
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
