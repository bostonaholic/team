// tests/researcher.evals.ts
//
// Judgment-tier eval for the researcher agent. The happy case is scored with
// the generic `judgeQuality` rubric (clarity / completeness / actionability);
// the isolation edge is scored deterministically with `outcomeJudge` (no judge
// call). Built on the shared `defineAgentEval` factory (per-case `mode` decides
// whether judgeQuality is called).
//
// The researcher investigates a real codebase, so each case runs in a tiny
// throwaway git-repo workdir (a fresh `git init` so the agent has a repo to
// operate in without touching this checkout) — supplied via `makeWorkdir`.
//
// Self-eval recursion guard: input.md is a FROZEN questions.md, never live
// pipeline output.
//
// Mock seams (offline, no key, no cost):
//   EVALS_MOCK_AGENT=<path>   replay a recorded NDJSON transcript
//   EVALS_MOCK_JUDGE=<path>   replay a recorded judge verdict JSON

import { expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineAgentEval } from "./helpers/agent-eval.ts";

const MIN_QUALITY = 3;

const PROMPT =
  "You are the isolated researcher. Answer each question below from the actual " +
  "codebase with file:line evidence. You see ONLY these questions — never the " +
  "user's task framing — so keep your findings grounded in the code.\n\n";

// Create a throwaway git-repo workdir so the researcher has a repo to operate
// in. Fails loud if git init fails (no silent zero-score path).
function makeRepoWorkdir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

defineAgentEval({
  agent: "researcher",
  prompt: PROMPT,
  makeWorkdir: makeRepoWorkdir,
  cases: [
    {
      mode: "judgment",
      name: "researcher-answers-from-questions",
      fixtureCase: "answers-from-questions",
      workdirPrefix: "researcher-e2e-",
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
      // Deterministic isolation guard: the user's task-framing phrase (the
      // planted detection_hint) must NOT appear in the findings, so its bug id
      // must land in outcome.missed.
      mode: "detection-rate",
      name: "researcher-no-task-leak",
      fixtureCase: "no-task-leak",
      workdirPrefix: "researcher-leak-e2e-",
      score: ({ result, outcome }) => ({
        passed:
          result.exitReason === "success" &&
          outcome.missed.includes("task-framing-leak") &&
          outcome.detected.length === 0,
        judgeScores: { detection_rate: outcome.detection_rate },
      }),
      assert: ({ result, outcome }) => {
        expect(result.exitReason).toBe("success");
        expect(outcome.missed).toContain("task-framing-leak");
        expect(outcome.detected.length).toBe(0);
      },
    },
  ],
});
