// tests/structure-planner.evals.ts
//
// Judgment-tier eval for the structure-planner agent. Scored with the generic
// `judgeQuality` rubric (clarity / completeness / actionability). Mirrors
// code-reviewer.evals.ts.
//
// Self-eval recursion guard (canonical trap): structure-planner grading its
// own live output would be circular. The fixtures are FROZEN design.md
// excerpts embedded in input.md, never live pipeline output.
//
// Mock seams (offline, no key, no cost):
//   EVALS_MOCK_AGENT=<path>   replay a recorded NDJSON transcript
//   EVALS_MOCK_JUDGE=<path>   replay a recorded judge verdict JSON
//   Per-case: EVALS_MOCK_* point at THAT case's mocks/ files; run one case at
//   a time (`-t "<case>"`) — the env vars are global single files, so running
//   the whole file with one case's mocks makes the other cases fail.

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
  "You are the structure-planner. Read the FROZEN design artifact below and " +
  "break it into vertical, independently testable slices, each with an " +
  "explicit acceptance signal. When the design is ambiguous, surface " +
  "assumptions and open questions instead of inventing slices.\n\n";

testIfSelected(
  "structure-planner-well-formed-design",
  async () => {
    const fixture = loadFixture("structure-planner", "well-formed-design");
    const workDir = mkdtempSync(join(tmpdir(), "structure-planner-e2e-"));

    try {
      const result = await runAgentTest({
        prompt: PROMPT + fixture.body,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "structure-planner-well-formed-design",
      });

      const outcome = outcomeJudge(fixture.groundTruth, result.output);
      const quality = await judgeQuality(result.output);

      const passed =
        result.exitReason === "success" &&
        quality.clarity >= MIN_QUALITY &&
        quality.completeness >= MIN_QUALITY &&
        quality.actionability >= MIN_QUALITY;

      collector.addTest({
        name: "structure-planner-well-formed-design",
        suite: "structure-planner-e2e",
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
  "structure-planner-ambiguous-design",
  async () => {
    const fixture = loadFixture("structure-planner", "ambiguous-design");
    const workDir = mkdtempSync(join(tmpdir(), "structure-planner-amb-e2e-"));

    try {
      const result = await runAgentTest({
        prompt: PROMPT + fixture.body,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "structure-planner-ambiguous-design",
      });

      // Deterministic graceful-degradation guard: an ambiguous design must
      // make the structure surface an assumptions / open-questions section
      // (the structural detection_hint) rather than fabricate slices.
      const outcome = outcomeJudge(fixture.groundTruth, result.output);
      const quality = await judgeQuality(result.output);

      const passed =
        result.exitReason === "success" &&
        outcome.passes_minimum &&
        quality.clarity >= MIN_QUALITY &&
        quality.completeness >= MIN_QUALITY &&
        quality.actionability >= MIN_QUALITY;

      collector.addTest({
        name: "structure-planner-ambiguous-design",
        suite: "structure-planner-e2e",
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
      expect(outcome.passes_minimum).toBe(true);
      expect(quality.clarity).toBeGreaterThanOrEqual(MIN_QUALITY);
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
