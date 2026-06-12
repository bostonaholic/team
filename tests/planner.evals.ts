// tests/planner.evals.ts
//
// Judgment-tier eval for the planner agent. Scored with the generic
// `judgeQuality` rubric (clarity / completeness / actionability) plus the
// deterministic `outcomeJudge`. Built on the shared `defineAgentEval` factory
// (tests/helpers/agent-eval.ts).
//
// Self-eval recursion guard: the fixtures are FROZEN structure.md excerpts
// embedded in input.md, never live pipeline output.
//
// Mock seams (offline, no key, no cost):
//   EVALS_MOCK_AGENT=<path>   replay a recorded NDJSON transcript
//   EVALS_MOCK_JUDGE=<path>   replay a recorded judge verdict JSON

import { expect } from "bun:test";

import { defineAgentEval } from "./helpers/agent-eval.ts";

const MIN_QUALITY = 3;

const PROMPT =
  "You are the planner. Read the FROZEN structure artifact below and produce " +
  "a tactical, file-level plan an implementer can execute slice by slice, " +
  "with ordered steps and per-slice tests. When the structure is ambiguous, " +
  "surface assumptions and open questions instead of inventing steps.\n\n";

defineAgentEval({
  agent: "planner",
  prompt: PROMPT,
  cases: [
    {
      mode: "judgment",
      name: "planner-well-formed-structure",
      fixtureCase: "well-formed-structure",
      workdirPrefix: "planner-e2e-",
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
      // Deterministic graceful-degradation guard: an ambiguous structure must
      // make the plan surface assumptions / open questions (or declare itself
      // blocked) rather than fabricate file-level steps.
      mode: "judgment",
      name: "planner-ambiguous-structure",
      fixtureCase: "ambiguous-structure",
      workdirPrefix: "planner-amb-e2e-",
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
