// tests/design-author.evals.ts
//
// Judgment-tier eval for the design-author agent. Scored with the generic
// `judgeQuality` rubric (clarity / completeness / actionability). Mirrors the
// structure of code-reviewer.evals.ts: the `.evals.ts` suffix keeps it out of
// bare `bun test` auto-discovery; `testIfSelected` gates execution by
// tier/diff.
//
// Self-eval recursion guard: the fixtures are FROZEN predecessor artifacts
// (a captured research.md excerpt) embedded in input.md, never live pipeline
// output.
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

// Minimum per-axis quality score (1-5) the design must earn from the LLM
// judge. Mirrors code-reviewer's MIN_REASON_SUBSTANCE.
const MIN_QUALITY = 3;

const PROMPT =
  "You are the design-author. Read the FROZEN research artifact below and " +
  "produce a design that proposes a concrete approach grounded in its " +
  "evidence, weighs tradeoffs, and — when the research is thin — surfaces " +
  "explicit assumptions and open questions instead of fabricating scope. " +
  "Do not invent findings that are not in the research.\n\n";

testIfSelected(
  "design-author-well-formed-research",
  async () => {
    const fixture = loadFixture("design-author", "well-formed-research");
    const workDir = mkdtempSync(join(tmpdir(), "design-author-e2e-"));

    try {
      const result = await runAgentTest({
        prompt: PROMPT + fixture.body,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "design-author-well-formed-research",
      });

      const outcome = outcomeJudge(fixture.groundTruth, result.output);
      const quality = await judgeQuality(result.output);

      const passed =
        result.exitReason === "success" &&
        quality.clarity >= MIN_QUALITY &&
        quality.completeness >= MIN_QUALITY &&
        quality.actionability >= MIN_QUALITY;

      collector.addTest({
        name: "design-author-well-formed-research",
        suite: "design-author-e2e",
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
  "design-author-thin-research",
  async () => {
    const fixture = loadFixture("design-author", "thin-research");
    const workDir = mkdtempSync(join(tmpdir(), "design-author-thin-e2e-"));

    try {
      const result = await runAgentTest({
        prompt: PROMPT + fixture.body,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "design-author-thin-research",
      });

      // Deterministic graceful-degradation guard: the design must surface an
      // assumptions / open-questions section (the structural detection_hint),
      // not fabricate scope.
      const outcome = outcomeJudge(fixture.groundTruth, result.output);
      const quality = await judgeQuality(result.output);

      const passed =
        result.exitReason === "success" &&
        outcome.passes_minimum &&
        quality.clarity >= MIN_QUALITY &&
        quality.completeness >= MIN_QUALITY &&
        quality.actionability >= MIN_QUALITY;

      collector.addTest({
        name: "design-author-thin-research",
        suite: "design-author-e2e",
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
