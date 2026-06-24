// tests/git-commit.evals.ts
//
// End-to-end eval for the git-commit methodology skill. Paid tier — spawns a
// real `claude -p` subprocess and scores its output.
//
// File-level gating by NAME: the `.evals.ts` suffix is outside Bun's
// auto-discovery pattern (`*.test.{ts,tsx,js,jsx}`), so `bun test` never loads
// this file unless it is targeted by an explicit path argument.
//
// Tier / diff gating: the test is registered through `testIfSelected`, which
// consults the selector (EVALS_TIER + diff-based selection, EVALS_ALL=1 forces
// everything). A non-selected test is registered as `test.skip` and never
// spawns the model.
//
// git-commit emits a text artifact (a commit message), not a findings list, so
// the deterministic axis (`outcomeJudge`) scores *required properties* — the
// Conventional-Commit subject shape — via the fixture's `detection_hint`
// regex, and the gated LLM judge grades message quality (mood, no trailing
// period, why-not-what body). Periodic tier: the quality axis has model-output
// variance (design Edge case — stochastic eval is periodic, not gate).

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

// Minimum message-quality score (1-5) the commit must earn from the LLM judge
// on the clarity axis, in addition to matching the deterministic subject
// shape. Catches the "right shape but junk message" failure mode.
const MIN_MESSAGE_QUALITY = 3;

testIfSelected(
  "git-commit-conventional-subject",
  async () => {
    const fixture = loadFixture("git-commit", "conventional-subject");
    const workDir = mkdtempSync(join(tmpdir(), "git-commit-e2e-"));

    try {
      const prompt =
        "You are applying the git-commit methodology to produce one commit " +
        "message for the staged change described below. Follow the 50/72 " +
        "rule and Conventional Commits exactly.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "git-commit-conventional-subject",
      });

      // Tier 1 — outcome judge (deterministic): does the output carry a
      // Conventional-Commit subject of the required shape? Computed from
      // ground-truth.json, no model call.
      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      // Tier 2 — LLM judge (gated): only spend on the model when the
      // deterministic shape check passed. Grades imperative mood, no trailing
      // period, why-not-what body via the generic 1-5 quality rubric.
      let messageQuality = 1;
      if (outcome.passes_minimum) {
        const quality = await judgeQuality(result.output);
        messageQuality = quality.clarity;
      }

      const passed =
        result.exitReason === "success" &&
        outcome.passes_minimum &&
        messageQuality >= MIN_MESSAGE_QUALITY;

      collector.addTest({
        name: "git-commit-conventional-subject",
        suite: "git-commit-e2e",
        tier: "e2e",
        passed,
        duration_ms: result.duration,
        cost_usd: result.costEstimate.estimatedCost,
        transcript: result.transcript,
        judge_scores: {
          detection_rate: outcome.detection_rate,
          message_quality: messageQuality,
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
      expect(messageQuality).toBeGreaterThanOrEqual(MIN_MESSAGE_QUALITY);
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
