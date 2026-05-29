// test/code-reviewer-e2e.test.ts
//
// End-to-end eval for the code-reviewer agent.
//
// Default (no EVALS env): the entire describe block is skipped — bun test
// stays free.
//
// `EVALS=1 bun test test/code-reviewer-e2e.test.ts` — invokes the real
// `claude -p` subprocess. Requires ANTHROPIC_API_KEY. Each test costs
// roughly $0.10–$1.
//
// `EVALS=1 EVALS_MOCK_AGENT=<path> bun test test/code-reviewer-e2e.test.ts`
// — replays a recorded NDJSON transcript instead of spawning claude. Used
// by the dev acceptance loop and by smoke-testing the harness offline.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EvalCollector } from "./helpers/eval-store";
import { loadFixture } from "./helpers/fixtures";
import { runAgentTest } from "./helpers/session-runner";

const evalsEnabled = !!process.env.EVALS;
const describeEval = evalsEnabled ? describe : describe.skip;
const collector = evalsEnabled ? new EvalCollector("e2e") : null;

describeEval("code-reviewer E2E", () => {
  test(
    "planted-null-deref: agent surfaces the seeded bug",
    async () => {
      const fixture = loadFixture("code-reviewer", "planted-null-deref");
      const workDir = mkdtempSync(join(tmpdir(), "code-reviewer-e2e-"));

      try {
        const prompt =
          "You are reviewing a code change. Use Conventional Comments " +
          "(`issue (blocking):`, `suggestion (non-blocking):`, `nitpick`). " +
          "Surface every correctness defect you can find with the specific " +
          "line and a one-line fix proposal.\n\n" +
          fixture.body;

        const result = await runAgentTest({
          prompt,
          workingDirectory: workDir,
          maxTurns: 6,
          timeout: 180_000,
          testName: "planted-null-deref",
        });

        // Outcome judging: did the agent's output mention the planted bug's
        // detection hint? Cheap deterministic check — no LLM judge needed
        // for this slice. The llm-judge tier covers reasoning quality.
        const expectedHints = fixture.groundTruth.bugs.map((b) =>
          b.detection_hint.toLowerCase(),
        );
        const lowered = result.output.toLowerCase();
        const detected = expectedHints.filter((h) => lowered.includes(h));
        const detectionRate = detected.length / expectedHints.length;
        const passed =
          result.exitReason === "success" &&
          detectionRate >= fixture.groundTruth.minimum_detection;

        collector?.addTest({
          name: "planted-null-deref",
          suite: "code-reviewer-e2e",
          tier: "e2e",
          passed,
          duration_ms: result.duration,
          cost_usd: result.costEstimate.estimatedCost,
          transcript: result.transcript,
          exit_reason: result.exitReason,
          model: result.model,
          first_response_ms: result.firstResponseMs,
          max_inter_turn_ms: result.maxInterTurnMs,
        });

        expect(result.exitReason).toBe("success");
        expect(detectionRate).toBeGreaterThanOrEqual(
          fixture.groundTruth.minimum_detection,
        );
      } finally {
        rmSync(workDir, { recursive: true, force: true });
      }
    },
    240_000,
  );

  afterAll(async () => {
    if (collector) await collector.finalize();
  });
});
