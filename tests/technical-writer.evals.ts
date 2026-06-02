// tests/technical-writer.evals.ts
//
// Judgment-tier eval for the technical-writer agent. The happy case is scored
// with the generic `judgeQuality` rubric (clarity / completeness /
// actionability); the hallucination edge is scored deterministically with
// `outcomeJudge` (no judge call). Built on the shared `defineAgentEval` factory
// (per-case `mode` decides whether judgeQuality is called).
//
// Self-eval recursion guard: input.md is a FROZEN diff / change set, never
// live pipeline output.
//
// Mock seams (offline, no key, no cost):
//   EVALS_MOCK_AGENT=<path>   replay a recorded NDJSON transcript
//   EVALS_MOCK_JUDGE=<path>   replay a recorded judge verdict JSON

import { expect } from "bun:test";

import { defineAgentEval } from "./helpers/agent-eval.ts";

const MIN_QUALITY = 3;

const PROMPT =
  "You are the technical writer. Read the frozen change set below and identify " +
  "the user-facing documentation gaps for every new public surface. Ground all " +
  "prose in what the diff actually implements — never invent APIs, flags, or " +
  "behavior the code does not show.\n\n";

defineAgentEval({
  agent: "technical-writer",
  prompt: PROMPT,
  cases: [
    {
      mode: "judgment",
      name: "technical-writer-flags-doc-gaps",
      fixtureCase: "flags-doc-gaps",
      workdirPrefix: "technical-writer-e2e-",
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
      // Deterministic hallucination guard: the fabricated-API phrase (the
      // planted detection_hint) must NOT appear in the output, so its bug id
      // must land in outcome.missed.
      mode: "detection-rate",
      name: "technical-writer-no-invented-api",
      fixtureCase: "no-invented-api",
      workdirPrefix: "technical-writer-halluc-e2e-",
      score: ({ result, outcome }) => ({
        passed:
          result.exitReason === "success" &&
          outcome.missed.includes("invented-api") &&
          outcome.detected.length === 0,
        judgeScores: { detection_rate: outcome.detection_rate },
      }),
      assert: ({ result, outcome }) => {
        expect(result.exitReason).toBe("success");
        expect(outcome.missed).toContain("invented-api");
        expect(outcome.detected.length).toBe(0);
      },
    },
  ],
});
