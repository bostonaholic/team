// tests/file-finder.evals.ts
//
// Detection-rate eval for the file-finder agent. Scored purely with the
// deterministic `outcomeJudge` — no LLM judge call. Built on the shared
// `defineAgentEval` factory (tests/helpers/agent-eval.ts), which owns the
// collector / workdir / runAgentTest / addTest / afterAll scaffolding; the
// per-case `score` + `assert` reproduce the original pass semantics exactly.
//
// Mock seam (offline, no key, no cost):
//   EVALS_MOCK_AGENT=<path>   replay a recorded NDJSON transcript
//   Per-case: EVALS_MOCK_AGENT points at THAT case's mocks/ file. It is a
//   GLOBAL single file, so run ONE case at a time (`-t "<case>"`); running the
//   whole file with a single case's mock makes the other cases fail.

import { expect } from "bun:test";

import { defineAgentEval } from "./helpers/agent-eval.ts";

const PROMPT =
  "You are a file-finder. Locate the real repository files that own " +
  "each described responsibility and report each by its repo-relative " +
  "path. Do not invent paths.\n\n";

defineAgentEval({
  agent: "file-finder",
  prompt: PROMPT,
  cases: [
    {
      mode: "detection-rate",
      name: "file-finder-finds-planted-files",
      fixtureCase: "finds-planted-files",
      workdirPrefix: "file-finder-e2e-",
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
      // Empty input must produce graceful, non-crashing output that does NOT
      // fabricate the planted path — so the detection score must NOT pass.
      mode: "detection-rate",
      name: "file-finder-empty-input",
      fixtureCase: "empty-input",
      workdirPrefix: "file-finder-empty-e2e-",
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
