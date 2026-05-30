// tests/security-reviewer.evals.ts
//
// Detection-rate eval for the security-reviewer agent. Scored purely with the
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
  "security-reviewer-planted-vuln",
  async () => {
    const fixture = loadFixture("security-reviewer", "planted-vuln");
    const workDir = mkdtempSync(join(tmpdir(), "security-reviewer-e2e-"));

    try {
      const prompt =
        "You are an adversarial security reviewer. Report each exploitable " +
        "vulnerability with a severity, the exact line, and a concrete " +
        "remediation. Do not flag safe code.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "security-reviewer-planted-vuln",
      });

      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      const passed = result.exitReason === "success" && outcome.passes_minimum;

      collector.addTest({
        name: "security-reviewer-planted-vuln",
        suite: "security-reviewer-e2e",
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
  "security-reviewer-safe-pattern",
  async () => {
    const fixture = loadFixture("security-reviewer", "safe-pattern");
    const workDir = mkdtempSync(join(tmpdir(), "security-reviewer-fp-e2e-"));

    try {
      const prompt =
        "You are an adversarial security reviewer. Report each exploitable " +
        "vulnerability with a severity, the exact line, and a concrete " +
        "remediation. Do not flag safe code.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "security-reviewer-safe-pattern",
      });

      // FP guard: the parameterized query is safe. A correct reviewer does
      // NOT report an injection, so the planted bug id must be MISSED, and
      // the count of "detected" findings must respect max_false_positives.
      const outcome = outcomeJudge(fixture.groundTruth, result.output);
      const maxFalsePositives = fixture.groundTruth.max_false_positives ?? 0;

      const passed =
        result.exitReason === "success" &&
        outcome.missed.includes("s1") &&
        outcome.detected.length <= maxFalsePositives;

      collector.addTest({
        name: "security-reviewer-safe-pattern",
        suite: "security-reviewer-e2e",
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
      expect(outcome.missed).toContain("s1");
      expect(outcome.detected.length).toBeLessThanOrEqual(maxFalsePositives);
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
