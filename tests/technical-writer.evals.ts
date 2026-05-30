// tests/technical-writer.evals.ts
//
// Judgment-tier eval for the technical-writer agent. The happy case is scored
// with the generic `judgeQuality` rubric (clarity / completeness /
// actionability); the hallucination edge is scored deterministically with
// `outcomeJudge`. Mirrors code-reviewer.evals.ts.
//
// Self-eval recursion guard: input.md is a FROZEN diff / change set, never
// live pipeline output.
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
  "You are the technical writer. Read the frozen change set below and identify " +
  "the user-facing documentation gaps for every new public surface. Ground all " +
  "prose in what the diff actually implements — never invent APIs, flags, or " +
  "behavior the code does not show.\n\n";

testIfSelected(
  "technical-writer-flags-doc-gaps",
  async () => {
    const fixture = loadFixture("technical-writer", "flags-doc-gaps");
    const workDir = mkdtempSync(join(tmpdir(), "technical-writer-e2e-"));

    try {
      const result = await runAgentTest({
        prompt: PROMPT + fixture.body,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "technical-writer-flags-doc-gaps",
      });

      const outcome = outcomeJudge(fixture.groundTruth, result.output);
      const quality = await judgeQuality(result.output);

      const passed =
        result.exitReason === "success" &&
        quality.clarity >= MIN_QUALITY &&
        quality.completeness >= MIN_QUALITY &&
        quality.actionability >= MIN_QUALITY;

      collector.addTest({
        name: "technical-writer-flags-doc-gaps",
        suite: "technical-writer-e2e",
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
  "technical-writer-no-invented-api",
  async () => {
    const fixture = loadFixture("technical-writer", "no-invented-api");
    const workDir = mkdtempSync(join(tmpdir(), "technical-writer-halluc-e2e-"));

    try {
      const result = await runAgentTest({
        prompt: PROMPT + fixture.body,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "technical-writer-no-invented-api",
      });

      // Deterministic hallucination guard: the fabricated-API phrase (the
      // planted detection_hint) must NOT appear in the output, so its bug id
      // must land in outcome.missed.
      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      const passed =
        result.exitReason === "success" &&
        outcome.missed.includes("invented-api") &&
        outcome.detected.length === 0;

      collector.addTest({
        name: "technical-writer-no-invented-api",
        suite: "technical-writer-e2e",
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
      expect(outcome.missed).toContain("invented-api");
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
