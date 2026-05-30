// tests/file-finder.evals.ts
//
// Detection-rate eval for the file-finder agent. Scored purely with the
// deterministic `outcomeJudge` — no LLM judge call. Mirrors the structure of
// code-reviewer.evals.ts (the `.evals.ts` suffix keeps it out of bare
// `bun test` auto-discovery; `testIfSelected` gates execution by tier/diff).
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
  "file-finder-finds-planted-files",
  async () => {
    const fixture = loadFixture("file-finder", "finds-planted-files");
    const workDir = mkdtempSync(join(tmpdir(), "file-finder-e2e-"));

    try {
      const prompt =
        "You are a file-finder. Locate the real repository files that own " +
        "each described responsibility and report each by its repo-relative " +
        "path. Do not invent paths.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "file-finder-finds-planted-files",
      });

      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      const passed = result.exitReason === "success" && outcome.passes_minimum;

      collector.addTest({
        name: "file-finder-finds-planted-files",
        suite: "file-finder-e2e",
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
  "file-finder-empty-input",
  async () => {
    const fixture = loadFixture("file-finder", "empty-input");
    const workDir = mkdtempSync(join(tmpdir(), "file-finder-empty-e2e-"));

    try {
      const prompt =
        "You are a file-finder. Locate the real repository files that own " +
        "each described responsibility and report each by its repo-relative " +
        "path. Do not invent paths.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "file-finder-empty-input",
      });

      // Empty input must produce graceful, non-crashing output that does NOT
      // fabricate the planted path — so the detection score must NOT pass.
      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      const passed =
        result.exitReason === "success" && outcome.passes_minimum === false;

      collector.addTest({
        name: "file-finder-empty-input",
        suite: "file-finder-e2e",
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
