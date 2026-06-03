// tests/changelog.evals.ts
//
// End-to-end eval for the changelog methodology skill. Paid tier — spawns a
// real `claude -p` subprocess and scores its output.
//
// File-level gating by NAME: the `.evals.ts` suffix is outside Bun's
// auto-discovery pattern, so `bun test` never loads this file unless targeted
// by an explicit path argument. Selection / tier gating goes through
// `testIfSelected`.
//
// changelog emits a text artifact (Keep-a-Changelog markdown), not a findings
// list, so the deterministic axis (`outcomeJudge`) scores *required
// properties* — the `### Added` / `### Fixed` section headings — and the gated
// LLM judge grades the harder filtering / user-facing-language property.
// Periodic tier: filtering is judgment-laden with model-output variance.

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

const MIN_FILTER_QUALITY = 3;

testIfSelected(
  "changelog-keep-a-changelog-filter",
  async () => {
    const fixture = loadFixture("changelog", "keep-a-changelog-filter");
    const workDir = mkdtempSync(join(tmpdir(), "changelog-e2e-"));

    try {
      const prompt =
        "You are applying the changelog methodology to translate commit " +
        "subjects into Keep-a-Changelog entries. Follow the Include/Exclude " +
        "filter rules exactly.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "changelog-keep-a-changelog-filter",
      });

      // Tier 1 — outcome judge (deterministic): are the required section
      // headings present? Computed from ground-truth.json, no model call.
      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      // Tier 2 — LLM judge (gated): only spend on the model when the
      // deterministic heading check passed. Grades filtering + user-facing
      // language via the generic 1-5 quality rubric.
      let filterQuality = 1;
      if (outcome.passes_minimum) {
        const quality = await judgeQuality(result.output);
        filterQuality = quality.completeness;
      }

      const passed =
        result.exitReason === "success" &&
        outcome.passes_minimum &&
        filterQuality >= MIN_FILTER_QUALITY;

      collector.addTest({
        name: "changelog-keep-a-changelog-filter",
        suite: "changelog-e2e",
        tier: "e2e",
        passed,
        duration_ms: result.duration,
        cost_usd: result.costEstimate.estimatedCost,
        transcript: result.transcript,
        judge_scores: {
          detection_rate: outcome.detection_rate,
          filter_quality: filterQuality,
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
      expect(filterQuality).toBeGreaterThanOrEqual(MIN_FILTER_QUALITY);
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
