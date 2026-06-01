// tests/skills.evals.ts
//
// Methodology skill-harness evals. One parameterized file over the 18
// methodology skills. For each skill we drive its SKILL.md procedure through
// the skill harness against a synthetic task, then:
//   1. a deterministic structural contract check (outcomeJudge) runs first —
//      it proves the skill's procedure produced the expected contract marker
//      (e.g. git-commit -> a conventional-commit subject);
//   2. judgeQuality scores substance (clarity / completeness / actionability).
//
// Each skill registers its OWN testIfSelected("skill:<skill>") so diff-gating
// and the CI matrix can target individual skills.
//
// Mock seams (offline, no key, no cost — note these are GLOBAL single files,
// so run one skill at a time when supplying mocks):
//   EVALS_MOCK_AGENT=<path>   replay a recorded NDJSON transcript
//   EVALS_MOCK_JUDGE=<path>   replay a recorded judge verdict JSON

import { afterAll, expect } from "bun:test";

import { EvalCollector, assertNoBudgetRegressions } from "./helpers/eval-store";
import { loadFixture } from "./helpers/fixtures";
import { judgeQuality, outcomeJudge } from "./helpers/llm-judge";
import { runSkillHarness } from "./helpers/skill-harness";
import { testIfSelected } from "./helpers/touchfiles";

const collector = new EvalCollector("e2e");

// Minimum per-axis quality score (1-5) the skill output must earn from the
// LLM judge. Mirrors code-reviewer's MIN_REASON_SUBSTANCE.
const MIN_QUALITY = 3;

// The 18 methodology skills. Each gets its own selectable eval.
const SKILLS = [
  "agent-open-questions",
  "changelog",
  "code-review",
  "documenting-decisions",
  "eng-design-doc-review",
  "engineering-standards",
  "git-commit",
  "product-requirements-doc",
  "product-thinking",
  "progress-tracking",
  "qrspi-workflow",
  "refactoring-to-patterns",
  "solid-principles",
  "systematic-debugging",
  "technical-design-doc",
  "test-driven-bug-fix",
  "test-first-development",
  "writing-prose",
] as const;

const TIMEOUT_MS = 240_000;

for (const skill of SKILLS) {
  testIfSelected(
    `skill:${skill}`,
    async () => {
      const fixture = loadFixture(`skills/${skill}`, "baseline");

      const result = await runSkillHarness({
        skillPath: `skills/${skill}/SKILL.md`,
        task: fixture.body,
        maxTurns: 6,
        timeout: 180_000,
        testName: `skill:${skill}`,
      });

      // 1. Deterministic structural contract check first. The skill's
      //    procedure must have produced the expected contract marker.
      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      // 2. Then the LLM-judge quality pass for substance.
      const quality = await judgeQuality(result.output);

      const passed =
        result.exitReason === "success" &&
        outcome.passes_minimum &&
        quality.clarity >= MIN_QUALITY &&
        quality.completeness >= MIN_QUALITY &&
        quality.actionability >= MIN_QUALITY;

      collector.addTest({
        name: `skill:${skill}`,
        suite: "skills-e2e",
        tier: "e2e",
        passed,
        duration_ms: result.duration,
        cost_usd: result.costEstimate.estimatedCost,
        transcript: result.transcript,
        judge_scores: {
          clarity: quality.clarity,
          completeness: quality.completeness,
          actionability: quality.actionability,
          detection_rate: outcome.detection_rate,
        },
        exit_reason: result.exitReason,
        model: result.model,
        first_response_ms: result.firstResponseMs,
        max_inter_turn_ms: result.maxInterTurnMs,
      });

      expect(result.exitReason).toBe("success");
      expect(outcome.passes_minimum).toBe(true);
      expect(quality.clarity).toBeGreaterThanOrEqual(MIN_QUALITY);
      expect(quality.completeness).toBeGreaterThanOrEqual(MIN_QUALITY);
      expect(quality.actionability).toBeGreaterThanOrEqual(MIN_QUALITY);
    },
    TIMEOUT_MS,
  );
}

afterAll(async () => {
  await collector.finalize();
  assertNoBudgetRegressions(collector);
});
