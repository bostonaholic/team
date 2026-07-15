// tests/code-reviewer.evals.ts
//
// End-to-end eval for the code-reviewer agent. Paid tier — spawns a real
// `claude -p` subprocess and scores its output with the LLM judge.
//
// File-level gating by NAME: the `.evals.ts` suffix is outside Bun's
// auto-discovery pattern (`*.test.{ts,tsx,js,jsx}`), so `bun test` never
// loads this file unless it is targeted by an explicit path argument.
//
// Tier / diff gating: each test is registered through `testIfSelected`,
// which consults the selector (EVALS_TIER + diff-based selection, with
// EVALS_ALL=1 forcing everything). A test that isn't selected is registered
// as `test.skip` and never spawns the model.
//
// Run paths:
//   bun run test:evals                       # all *.evals.ts, EVALS_ALL=1
//   bun test test/code-reviewer.evals.ts     # ad-hoc (needs EVALS_ANTHROPIC_API_KEY)
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
import { judgeReviewerOutput, outcomeJudge } from "./helpers/llm-judge";
import { runAgentTest } from "./helpers/session-runner";
import { testIfSelected } from "./helpers/touchfiles";

const collector = new EvalCollector("e2e");

// Minimum reasoning-quality score (1-5) the agent's review must earn from
// the LLM judge, in addition to detecting the planted bug. Catches the
// "mentioned the hint but the review is junk" failure mode.
const MIN_REASON_SUBSTANCE = 3;

// Deterministic blocking-severity check: the Conventional Comments
// `issue (blocking):` label, tolerating markdown bold markers and spacing
// variance (`**issue (blocking):**`, `**issue (blocking)**:`,
// `issue(blocking):`). Linear-time — each decoration gap is a single
// character class (`[\s*]*`), so no adjacent quantifiers compete over the
// same characters and there is no backtracking blowup on adversarial input.
const BLOCKING_LABEL = /\bissue[\s*]*\(blocking\)[\s*]*:/i;

// Registers one planted-bug E2E eval. Every fixture runs the identical
// pipeline — prompt scaffold, agent run, deterministic outcome judge, LLM
// review judge, collector record, assertions — varying only in:
//   fixtureName          the evals/fixtures/code-reviewer/<name>/ dir, also
//                        the testIfSelected selection-map key
//   defectClause         the defect-scope phrase spliced into the prompt
//   requireBlockingLabel when the fixture's design promises the reviewer
//                        flags the bug *as blocking*, additionally require
//                        an `issue (blocking):` label in the output
//                        (deterministic, no extra judge cost)
function registerPlantedBugEval(options: {
  fixtureName: string;
  defectClause: string;
  requireBlockingLabel?: boolean;
}): void {
  const { fixtureName, defectClause, requireBlockingLabel = false } = options;

  testIfSelected(
    fixtureName,
    async () => {
      const fixture = loadFixture("code-reviewer", fixtureName);
      const workDir = mkdtempSync(join(tmpdir(), "code-reviewer-e2e-"));

      try {
        const prompt =
          "You are reviewing a code change. Use Conventional Comments " +
          "(`issue (blocking):`, `suggestion (non-blocking):`, `nitpick`). " +
          `Surface every ${defectClause} defect you ` +
          "can find with the specific line and a one-line fix proposal.\n\n" +
          fixture.body;

        const result = await runAgentTest({
          prompt,
          workingDirectory: workDir,
          maxTurns: 6,
          timeout: 180_000,
          testName: fixtureName,
        });

        // Tier 1 — outcome judge (deterministic): did the agent surface the
        // planted bug? Computed from ground-truth.json, no model call.
        const outcome = outcomeJudge(fixture.groundTruth, result.output);

        // Tier 2 — LLM judge: is the review actually good (concrete line,
        // named failure mode, root-cause fix)? Deterministic-first inside
        // judgeReviewerOutput gates the model call on a Conventional Comment
        // label being present.
        const review = await judgeReviewerOutput(result.output);

        const blockingLabelOk =
          !requireBlockingLabel || BLOCKING_LABEL.test(result.output);

        const passed =
          result.exitReason === "success" &&
          outcome.passes_minimum &&
          blockingLabelOk &&
          review.reason_substance >= MIN_REASON_SUBSTANCE;

        collector.addTest({
          name: fixtureName,
          suite: "code-reviewer-e2e",
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
        if (requireBlockingLabel) {
          // Detection passed (asserted above); the design additionally
          // promises the finding carries a blocking severity label.
          expect(result.output).toMatch(BLOCKING_LABEL);
        }
        expect(review.reason_substance).toBeGreaterThanOrEqual(
          MIN_REASON_SUBSTANCE,
        );
      } finally {
        rmSync(workDir, { recursive: true, force: true });
      }
    },
    240_000,
  );
}

registerPlantedBugEval({
  fixtureName: "planted-null-deref",
  defectClause: "correctness",
});

registerPlantedBugEval({
  fixtureName: "planted-time-bomb",
  defectClause: "correctness AND test-quality/flakiness",
  requireBlockingLabel: true,
});

afterAll(async () => {
  await collector.finalize();
  // A passing-but-3×-more-expensive run is a regression. Fail the run
  // (and therefore CI) on any budget regression vs. the previous run.
  assertNoBudgetRegressions(collector);
});
