// tests/structure-planner.evals.ts
//
// Judgment-tier eval for the structure-planner agent. Scored with the generic
// `judgeQuality` rubric (clarity / completeness / actionability) plus the
// deterministic `outcomeJudge`. Built on the shared `defineAgentEval` factory
// (tests/helpers/agent-eval.ts).
//
// Self-eval recursion guard (canonical trap): structure-planner grading its
// own live output would be circular. The fixtures are FROZEN design.md
// excerpts embedded in input.md, never live pipeline output.
//
// Mock seams (offline, no key, no cost):
//   EVALS_MOCK_AGENT=<path>   replay a recorded NDJSON transcript
//   EVALS_MOCK_JUDGE=<path>   replay a recorded judge verdict JSON

import { expect } from "bun:test";

import { defineAgentEval } from "./helpers/agent-eval.ts";

const MIN_QUALITY = 3;

const PROMPT =
  "You are the structure-planner. Read the FROZEN design artifact below and " +
  "break it into vertical, independently testable slices, each with an " +
  "explicit acceptance signal. When the design is ambiguous, surface " +
  "assumptions and open questions instead of inventing slices.\n\n";

defineAgentEval({
  agent: "structure-planner",
  prompt: PROMPT,
  cases: [
    {
      mode: "judgment",
      name: "structure-planner-well-formed-design",
      fixtureCase: "well-formed-design",
      workdirPrefix: "structure-planner-e2e-",
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
      // Deterministic graceful-degradation guard: an ambiguous design must
      // make the structure surface an assumptions / open-questions section
      // (the structural detection_hint) rather than fabricate slices.
      mode: "judgment",
      name: "structure-planner-ambiguous-design",
      fixtureCase: "ambiguous-design",
      workdirPrefix: "structure-planner-amb-e2e-",
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
      },
    },
  ],
});
