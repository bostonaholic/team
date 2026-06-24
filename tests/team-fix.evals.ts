// tests/team-fix.evals.ts
//
// End-to-end eval for the team-fix (compressed bug-fix) skill. Paid tier —
// spawns a real `claude -p` subprocess and scores its output.
//
// File-level gating by NAME: the `.evals.ts` suffix is outside Bun's
// auto-discovery pattern, so `bun test` never loads this file unless targeted
// explicitly. Selection / tier gating goes through `testIfSelected`.
//
// The load-bearing property is test-first ordering (failing test before the
// fix). The deterministic axis (`outcomeJudge`) confirms a failing-test step
// is mentioned; the gated LLM judge grades the ordering. Periodic tier:
// ordering is a judgment with model-output variance.

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

const MIN_ORDERING = 3;

testIfSelected(
  "team-fix-test-first-ordering",
  async () => {
    const fixture = loadFixture("team-fix", "test-first-ordering");
    const workDir = mkdtempSync(join(tmpdir(), "team-fix-e2e-"));

    try {
      const prompt =
        "You are running the compressed bug-fix pipeline. Follow the " +
        "REPRODUCE → RED → GREEN → VERIFY ordering; the failing test must " +
        "come before the fix.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "team-fix-test-first-ordering",
      });

      // Tier 1 — outcome judge (deterministic): is a failing-test step
      // mentioned at all? Computed from ground-truth.json, no model call.
      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      // Tier 2 — LLM judge (gated): grade test-first ordering only when a
      // failing-test step was actually mentioned. Axis mapping: the team-fix
      // property under test is "would a reader know to write the failing test
      // before the fix and follow the steps in order?", which maps onto
      // judgeQuality's `actionability` axis (a reader knows what to do next).
      // The other axes (clarity/completeness) are not the property here.
      let ordering = 1;
      if (outcome.passes_minimum) {
        const quality = await judgeQuality(result.output);
        ordering = quality.actionability;
      }

      const passed =
        result.exitReason === "success" &&
        outcome.passes_minimum &&
        ordering >= MIN_ORDERING;

      collector.addTest({
        name: "team-fix-test-first-ordering",
        suite: "team-fix-e2e",
        tier: "e2e",
        passed,
        duration_ms: result.duration,
        cost_usd: result.costEstimate.estimatedCost,
        transcript: result.transcript,
        judge_scores: {
          detection_rate: outcome.detection_rate,
          ordering,
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
      expect(ordering).toBeGreaterThanOrEqual(MIN_ORDERING);
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
