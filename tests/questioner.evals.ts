// tests/questioner.evals.ts
//
// Judgment-tier eval for the questioner agent. The happy case is scored with
// the generic `judgeQuality` rubric (clarity / completeness / actionability);
// the leakage edge is scored deterministically with `outcomeJudge` (no judge
// call). Built on the shared `defineAgentEval` factory (per-case `mode` decides
// whether judgeQuality is called).
//
// Self-eval recursion guard: input.md is a raw task description (synthetic
// prompt), never live pipeline output.
//
// Mock seams (offline, no key, no cost):
//   EVALS_MOCK_AGENT=<path>   replay a recorded NDJSON transcript
//   EVALS_MOCK_JUDGE=<path>   replay a recorded judge verdict JSON

import { expect } from "bun:test";

import { defineAgentEval } from "./helpers/agent-eval.ts";

const MIN_QUALITY = 3;

const PROMPT =
  "You are the questioner. Decompose the raw task below into a task statement " +
  "plus concrete research questions for an isolated researcher. Keep the " +
  "questions open and unbiased — do not pre-bake a chosen solution into the " +
  "questions.\n\n";

defineAgentEval({
  agent: "questioner",
  prompt: PROMPT,
  cases: [
    {
      mode: "judgment",
      name: "questioner-decomposes-intent",
      fixtureCase: "decomposes-intent",
      workdirPrefix: "questioner-e2e-",
      score: ({ result, outcome, quality }) => ({
        passed:
          result.exitReason === "success" &&
          outcome.passes_minimum &&
          quality.clarity >= MIN_QUALITY &&
          quality.completeness >= MIN_QUALITY &&
          quality.actionability >= MIN_QUALITY,
        judgeScores: {
          clarity: quality.clarity,
          completeness: quality.completeness,
          actionability: quality.actionability,
          detection_rate: outcome.detection_rate,
        },
      }),
      assert: ({ result, outcome, quality }) => {
        expect(result.exitReason).toBe("success");
        expect(outcome.passes_minimum).toBe(true);
        expect(quality.clarity).toBeGreaterThanOrEqual(MIN_QUALITY);
        expect(quality.completeness).toBeGreaterThanOrEqual(MIN_QUALITY);
        expect(quality.actionability).toBeGreaterThanOrEqual(MIN_QUALITY);
      },
    },
    {
      // Deterministic research-isolation guard: the pre-chosen-solution phrase
      // (the planted detection_hint) must NOT appear in the questions, so its
      // bug id must land in outcome.missed.
      mode: "detection-rate",
      name: "questioner-no-intent-leak",
      fixtureCase: "no-intent-leak",
      workdirPrefix: "questioner-leak-e2e-",
      score: ({ result, outcome }) => ({
        passed:
          result.exitReason === "success" &&
          outcome.missed.includes("intent-leak") &&
          outcome.detected.length === 0,
        judgeScores: { detection_rate: outcome.detection_rate },
      }),
      assert: ({ result, outcome }) => {
        expect(result.exitReason).toBe("success");
        expect(outcome.missed).toContain("intent-leak");
        expect(outcome.detected.length).toBe(0);
      },
    },
  ],
});
