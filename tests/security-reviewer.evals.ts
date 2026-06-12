// tests/security-reviewer.evals.ts
//
// Detection-rate eval for the security-reviewer agent. Scored purely with the
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
  "You are an adversarial security reviewer. Report each exploitable " +
  "vulnerability with a severity, the exact line, and a concrete " +
  "remediation. Do not flag safe code.\n\n";

defineAgentEval({
  agent: "security-reviewer",
  prompt: PROMPT,
  cases: [
    {
      mode: "detection-rate",
      name: "security-reviewer-planted-vuln",
      fixtureCase: "planted-vuln",
      workdirPrefix: "security-reviewer-e2e-",
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
      // FP guard: the parameterized query is safe. A correct reviewer does
      // NOT report an injection, so the planted bug id must be MISSED, and
      // the count of "detected" findings must respect max_false_positives.
      mode: "detection-rate",
      name: "security-reviewer-safe-pattern",
      fixtureCase: "safe-pattern",
      workdirPrefix: "security-reviewer-fp-e2e-",
      score: ({ result, outcome, fixture }) => {
        const maxFalsePositives = fixture.groundTruth.max_false_positives ?? 0;
        return {
          passed:
            result.exitReason === "success" &&
            outcome.missed.includes("s1") &&
            outcome.detected.length <= maxFalsePositives,
          judgeScores: { detection_rate: outcome.detection_rate },
        };
      },
      assert: ({ result, outcome, fixture }) => {
        const maxFalsePositives = fixture.groundTruth.max_false_positives ?? 0;
        expect(result.exitReason).toBe("success");
        expect(outcome.missed).toContain("s1");
        expect(outcome.detected.length).toBeLessThanOrEqual(maxFalsePositives);
      },
    },
  ],
});
