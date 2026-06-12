// tests/verifier.evals.ts
//
// Detection-rate eval for the verifier agent. Scored purely with the
// deterministic `outcomeJudge` — no LLM judge call. Built on the shared
// `defineAgentEval` factory (tests/helpers/agent-eval.ts).
//
// Mock seam (offline, no key, no cost):
//   EVALS_MOCK_AGENT=<path>   replay a recorded NDJSON transcript
//   Per-case: EVALS_MOCK_AGENT points at THAT case's mocks/ file. It is a
//   GLOBAL single file, so run ONE case at a time (`-t "<case>"`); running the
//   whole file with a single case's mock makes the other cases fail.

import { expect } from "bun:test";

import { defineAgentEval } from "./helpers/agent-eval.ts";

const DETECT_PROMPT =
  "You are a verifier. Check the implementer's completion claim against " +
  "the stated acceptance contract. Name any specific contract violation " +
  "you find.\n\n";

const NO_OP_PROMPT =
  "You are a verifier. Check the implementer's completion claim against " +
  "the stated acceptance contracts. Name EVERY specific contract " +
  "violation you find; do not stop at the first.\n\n";

defineAgentEval({
  agent: "verifier",
  prompt: DETECT_PROMPT,
  cases: [
    {
      mode: "detection-rate",
      name: "verifier-detects-violation",
      fixtureCase: "detects-violation",
      workdirPrefix: "verifier-e2e-",
      score: ({ result, outcome }) => ({
        passed: result.exitReason === "success" && outcome.passes_minimum,
        judgeScores: { detection_rate: outcome.detection_rate },
      }),
      assert: ({ result, outcome, fixture }) => {
        expect(result.exitReason).toBe("success");
        expect(outcome.detection_rate).toBeGreaterThanOrEqual(
          fixture.groundTruth.minimum_detection,
        );
      },
    },
    {
      // Two violations are planted with minimum_detection 1.0: a verifier that
      // catches only one cannot pass the minimum. A no-op (catches none) also
      // cannot pass. The happy mock catches both, so passes_minimum is true;
      // the guard's purpose is that a partial/no-op CANNOT trivially pass.
      mode: "detection-rate",
      name: "verifier-no-op-guard",
      fixtureCase: "no-op-guard",
      workdirPrefix: "verifier-noop-e2e-",
      prompt: NO_OP_PROMPT,
      score: ({ result, outcome }) => ({
        passed: result.exitReason === "success" && outcome.passes_minimum,
        judgeScores: { detection_rate: outcome.detection_rate },
      }),
      assert: ({ result, outcome, fixture }) => {
        expect(result.exitReason).toBe("success");
        // minimum_detection >= planted count guarantees a no-op cannot pass.
        expect(fixture.groundTruth.minimum_detection).toBeGreaterThanOrEqual(1);
        expect(outcome.detection_rate).toBeGreaterThanOrEqual(
          fixture.groundTruth.minimum_detection,
        );
      },
    },
  ],
});
