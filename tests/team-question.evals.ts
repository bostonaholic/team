// tests/team-question.evals.ts
//
// End-to-end eval for the team-question (QUESTION phase) skill. Paid tier —
// spawns a real `claude -p` subprocess and scores its output.
//
// File-level gating by NAME: the `.evals.ts` suffix is outside Bun's
// auto-discovery pattern, so `bun test` never loads this file unless targeted
// explicitly. Selection / tier gating goes through `testIfSelected`.
//
// The load-bearing property is research-neutral framing. It is graded in two
// layers: a deterministic no-leak guard pins the SPECIFIC forbidden feature
// tokens (the questions must never name "rate limiting", "429", etc. — ported
// from #32's questioner/no-intent-leak idea), while the gated LLM judge grades
// neutrality more broadly (a fuzzy negative property a regex can't fully
// capture). `outcomeJudge` first confirms questions were emitted at all.
// Periodic tier: the neutrality axis is a judgment with model-output variance.

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

const MIN_NEUTRALITY = 3;

testIfSelected(
  "team-question-neutral-questions",
  async () => {
    const fixture = loadFixture("team-question", "neutral-questions");
    const workDir = mkdtempSync(join(tmpdir(), "team-question-e2e-"));

    try {
      const prompt =
        "You are running the QUESTION phase. Split intent from neutral " +
        "research questions; emit only the research questions in your " +
        "response.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "team-question-neutral-questions",
      });

      // Tier 1 — outcome judge (deterministic): were research questions
      // emitted at all? Computed from ground-truth.json, no model call.
      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      // Tier 1b — deterministic no-leak guard: the emitted questions must NOT
      // name the feature the questioner was handed. The fixture's intent is
      // rate limiting; a neutral question never needs these tokens. Checked
      // only on question lines (ending in "?") so a meta-preamble that explains
      // what was deliberately avoided cannot trip the guard.
      const FORBIDDEN_INTENT = /rate[- ]?limit|\b429\b|retry-after|plan tier/i;
      const questionLines = result.output
        .split("\n")
        .filter((l) => /\?\s*$/.test(l.trim()));
      const noIntentLeak = !questionLines.some((l) => FORBIDDEN_INTENT.test(l));

      // Tier 2 — LLM judge (gated): grade research-neutral framing only when
      // questions were actually emitted.
      let neutrality = 1;
      if (outcome.passes_minimum) {
        const quality = await judgeQuality(result.output);
        neutrality = quality.clarity;
      }

      const passed =
        result.exitReason === "success" &&
        outcome.passes_minimum &&
        noIntentLeak &&
        neutrality >= MIN_NEUTRALITY;

      collector.addTest({
        name: "team-question-neutral-questions",
        suite: "team-question-e2e",
        tier: "e2e",
        passed,
        duration_ms: result.duration,
        cost_usd: result.costEstimate.estimatedCost,
        transcript: result.transcript,
        judge_scores: {
          detection_rate: outcome.detection_rate,
          no_intent_leak: noIntentLeak ? 1 : 0,
          neutrality,
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
      expect(noIntentLeak).toBe(true);
      expect(neutrality).toBeGreaterThanOrEqual(MIN_NEUTRALITY);
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
