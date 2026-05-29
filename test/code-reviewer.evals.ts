// test/code-reviewer-e2e.test.ts
//
// End-to-end eval for the code-reviewer agent. Paid tier — spawns a real
// `claude -p` subprocess and consumes tokens.
//
// File-level gating: this file is excluded from the default `bun run test`
// invocation via the package.json --ignore patterns. It runs only when
// explicitly invoked through:
//
//   bun run test:periodic       # full paid suite, all evals files
//   bun run test:evals          # paid suite scoped by EVALS_TIER
//   bun test test/code-reviewer-e2e.test.ts   # ad-hoc, with EVALS_MOCK_AGENT
//
// The runtime cost gate (`EVALS=1`) lives in package.json scripts; this
// file does not re-implement the gate, so it never appears as a "skipped"
// test in the gate-tier output.
//
// Mock seam: `EVALS_MOCK_AGENT=<path>` replays a recorded NDJSON transcript
// instead of spawning claude — useful for harness smoke tests without
// spending money or needing ANTHROPIC_API_KEY.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EvalCollector } from "./helpers/eval-store";
import { loadFixture } from "./helpers/fixtures";
import { runAgentTest } from "./helpers/session-runner";

const collector = new EvalCollector("e2e");

describe("code-reviewer E2E", () => {
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

        collector.addTest({
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
});

afterAll(async () => {
  await collector.finalize();
});
