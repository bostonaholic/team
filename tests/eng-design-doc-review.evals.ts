// tests/eng-design-doc-review.evals.ts
//
// End-to-end eval for the eng-design-doc-review skill. Paid tier — spawns a
// real `claude -p` subprocess and scores its output.
//
// File-level gating by NAME: the `.evals.ts` suffix is outside Bun's
// auto-discovery pattern, so `bun test` never loads this file unless targeted
// explicitly. Selection / tier gating goes through `testIfSelected`.
//
// This is the closest analog to the code-reviewer template: the review emits
// Conventional-Comments findings, so it reuses the same deterministic-first
// cascade — `outcomeJudge` scores planted-gap detection, then
// `judgeReviewerOutput` (gated on a Conventional Comment label) grades review
// substance. Periodic tier: review quality has model-output variance.

import { afterAll } from "bun:test";
import { expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EvalCollector, assertNoBudgetRegressions } from "./helpers/eval-store";
import { loadFixture } from "./helpers/fixtures";
import { judgeReviewerOutput, outcomeJudge } from "./helpers/llm-judge";
import { runAgentTest } from "./helpers/session-runner";
import { testIfSelected } from "./helpers/touchfiles";

const collector = new EvalCollector("e2e");

const MIN_REASON_SUBSTANCE = 3;

testIfSelected(
  "eng-design-doc-review-planted-missing-alternatives",
  async () => {
    const fixture = loadFixture(
      "eng-design-doc-review",
      "planted-missing-alternatives",
    );
    const workDir = mkdtempSync(join(tmpdir(), "eng-design-doc-review-e2e-"));

    try {
      const prompt =
        "You are adversarially reviewing a design document with fresh " +
        "context. Use Conventional Comments and end with a verdict.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "eng-design-doc-review-planted-missing-alternatives",
      });

      // Tier 1 — outcome judge (deterministic): did the review surface the
      // planted gap (missing alternative / unstated trade-off)? Computed from
      // ground-truth.json, no model call.
      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      // Tier 2 — LLM judge (gated on a Conventional Comment label inside
      // judgeReviewerOutput): is the review actually substantive?
      const review = await judgeReviewerOutput(result.output);

      const passed =
        result.exitReason === "success" &&
        outcome.passes_minimum &&
        review.reason_substance >= MIN_REASON_SUBSTANCE;

      collector.addTest({
        name: "eng-design-doc-review-planted-missing-alternatives",
        suite: "eng-design-doc-review-e2e",
        tier: "e2e",
        passed,
        duration_ms: result.duration,
        cost_usd: result.costEstimate.estimatedCost,
        transcript: result.transcript,
        judge_scores: {
          detection_rate: outcome.detection_rate,
          reason_substance: review.reason_substance,
        },
        exit_reason: result.exitReason,
        model: result.model,
        first_response_ms: result.firstResponseMs,
        max_inter_turn_ms: result.maxInterTurnMs,
      });

      expect(result.exitReason).toBe("success");
      expect(outcome.detection_rate).toBeGreaterThanOrEqual(
        fixture.groundTruth.minimum_detection,
      );
      expect(review.reason_substance).toBeGreaterThanOrEqual(
        MIN_REASON_SUBSTANCE,
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
