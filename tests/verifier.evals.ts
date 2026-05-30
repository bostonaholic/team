// tests/verifier.evals.ts
//
// Detection-rate eval for the verifier agent. Scored purely with the
// deterministic `outcomeJudge` — no LLM judge call. Mirrors
// code-reviewer.evals.ts.
//
// Mock seam (offline, no key, no cost):
//   EVALS_MOCK_AGENT=<path>   replay a recorded NDJSON transcript
//   Per-case: EVALS_MOCK_AGENT points at THAT case's mocks/ file. It is a
//   GLOBAL single file, so run ONE case at a time (`-t "<case>"`); running the
//   whole file with a single case's mock makes the other cases fail.

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
  "verifier-detects-violation",
  async () => {
    const fixture = loadFixture("verifier", "detects-violation");
    const workDir = mkdtempSync(join(tmpdir(), "verifier-e2e-"));

    try {
      const prompt =
        "You are a verifier. Check the implementer's completion claim against " +
        "the stated acceptance contract. Name any specific contract violation " +
        "you find.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "verifier-detects-violation",
      });

      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      const passed = result.exitReason === "success" && outcome.passes_minimum;

      collector.addTest({
        name: "verifier-detects-violation",
        suite: "verifier-e2e",
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
  "verifier-no-op-guard",
  async () => {
    const fixture = loadFixture("verifier", "no-op-guard");
    const workDir = mkdtempSync(join(tmpdir(), "verifier-noop-e2e-"));

    try {
      const prompt =
        "You are a verifier. Check the implementer's completion claim against " +
        "the stated acceptance contracts. Name EVERY specific contract " +
        "violation you find; do not stop at the first.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "verifier-no-op-guard",
      });

      // Two violations are planted with minimum_detection 1.0: a verifier that
      // catches only one cannot pass the minimum. A no-op (catches none) also
      // cannot pass. The happy mock catches both, so passes_minimum is true;
      // the guard's purpose is that a partial/no-op CANNOT trivially pass.
      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      const passed = result.exitReason === "success" && outcome.passes_minimum;

      collector.addTest({
        name: "verifier-no-op-guard",
        suite: "verifier-e2e",
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
      // minimum_detection >= planted count guarantees a no-op cannot pass.
      expect(fixture.groundTruth.minimum_detection).toBeGreaterThanOrEqual(1);
      expect(outcome.detection_rate).toBeGreaterThanOrEqual(
        fixture.groundTruth.minimum_detection,
      );
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
