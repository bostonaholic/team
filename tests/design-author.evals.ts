// tests/design-author.evals.ts
//
// Judgment-tier eval for the design-author agent. Scored with the generic
// `judgeQuality` rubric (clarity / completeness / actionability) plus the
// deterministic `outcomeJudge`. Built on the shared `defineAgentEval` factory
// (tests/helpers/agent-eval.ts), which calls judgeQuality automatically for
// `mode: "judgment"` cases.
//
// Self-eval recursion guard: the fixtures are FROZEN predecessor artifacts
// (a captured research.md excerpt) embedded in input.md, never live pipeline
// output.
//
// Mock seams (offline, no key, no cost):
//   EVALS_MOCK_AGENT=<path>   replay a recorded NDJSON transcript
//   EVALS_MOCK_JUDGE=<path>   replay a recorded judge verdict JSON

import { expect } from "bun:test";

import { defineAgentEval } from "./helpers/agent-eval.ts";

// Minimum per-axis quality score (1-5) the design must earn from the LLM
// judge. Mirrors code-reviewer's MIN_REASON_SUBSTANCE.
const MIN_QUALITY = 3;

const PROMPT =
  "You are the design-author. Read the FROZEN research artifact below and " +
  "produce a design that proposes a concrete approach grounded in its " +
  "evidence, weighs tradeoffs, and — when the research is thin — surfaces " +
  "explicit assumptions and open questions instead of fabricating scope. " +
  "Do not invent findings that are not in the research.\n\n";

defineAgentEval({
  agent: "design-author",
  prompt: PROMPT,
  cases: [
    {
      mode: "judgment",
      name: "design-author-well-formed-research",
      fixtureCase: "well-formed-research",
      workdirPrefix: "design-author-e2e-",
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
      // Deterministic graceful-degradation guard: the design must surface an
      // assumptions / open-questions section (the structural detection_hint),
      // not fabricate scope.
      mode: "judgment",
      name: "design-author-thin-research",
      fixtureCase: "thin-research",
      workdirPrefix: "design-author-thin-e2e-",
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
