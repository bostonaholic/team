// tests/test-architect.evals.ts
//
// Detection-rate eval for the test-architect agent. Scored purely with the
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

const PROMPT =
  "You are a test-architect. Identify the untested branch(es) and " +
  "describe the acceptance test(s) needed to cover them.\n\n";

defineAgentEval({
  agent: "test-architect",
  prompt: PROMPT,
  cases: [
    {
      mode: "detection-rate",
      name: "test-architect-covers-branch",
      fixtureCase: "covers-branch",
      workdirPrefix: "test-architect-e2e-",
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
      // Empty input must produce graceful output that does NOT fabricate the
      // planted coverage gap — so the detection score must NOT pass.
      mode: "detection-rate",
      name: "test-architect-empty-input",
      fixtureCase: "empty-input",
      workdirPrefix: "test-architect-empty-e2e-",
      score: ({ result, outcome }) => ({
        passed:
          result.exitReason === "success" && outcome.passes_minimum === false,
        judgeScores: { detection_rate: outcome.detection_rate },
      }),
      assert: ({ result, outcome }) => {
        expect(result.exitReason).toBe("success");
        expect(outcome.passes_minimum).toBe(false);
      },
    },
  ],
});
