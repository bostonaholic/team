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

// Some skills produce a deliberately TERSE, structured artifact whose contract
// is the structural marker itself — a Keep-a-Changelog entry, a conventional
// commit, an Open Questions envelope, a per-step ledger. judgeQuality's
// `completeness` and `actionability` axes were calibrated for reviews and
// design docs; applying them to a two-line changelog entry is a category error
// (a correct entry is minimal, so it scores low no matter how perfect it is).
// For these skills the deterministic detection_rate already verifies the
// contract, so the quality gate checks only `clarity` (is it well-formed and
// readable). The substance skills keep all three axes.
const STRUCTURAL_SKILLS = new Set<string>([
  "changelog",
  "git-commit",
  "agent-open-questions",
  "progress-tracking",
  // nested-agents is a guardrail skill: its contract is that a dispatch plan
  // applies the rules (read-only helpers, inline fallback, neutral verification
  // claims), which the deterministic detection_rate verifies. A faithful plan
  // is terse, so completeness/actionability would mis-penalize it — gate on
  // clarity only, like the other protocol skills above.
  "nested-agents",
]);

// The 18 methodology skills. Each gets its own selectable eval.
const SKILLS = [
  "agent-open-questions",
  "changelog",
  "code-review",
  "documenting-decisions",
  "eng-design-doc-review",
  "engineering-standards",
  "git-commit",
  "nested-agents",
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
        // Skill fixtures elicit a prose artifact in a single response. 12 turns
        // gives the agent room to read its loaded SKILL.md and emit the
        // artifact without exhausting the turn budget on exploration — 6 was
        // too tight and produced spurious error_max_turns failures.
        skillPath: `skills/${skill}/SKILL.md`,
        task: fixture.body,
        maxTurns: 12,
        timeout: 180_000,
        testName: `skill:${skill}`,
        // Headless CI runs the agent in permissionMode: default; without this a
        // skill that reads/writes a file stalls on a permission prompt and dies
        // with error_max_turns. The workdir is an ephemeral sandbox.
        bypassPermissions: true,
      });

      // 1. Deterministic structural contract check first. The skill's
      //    procedure must have produced the expected contract marker.
      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      // 2. Then the LLM-judge quality pass for substance. Structural skills are
      //    gated on clarity only (their terse artifact is verified by the
      //    deterministic marker, not by prose-completeness — see
      //    STRUCTURAL_SKILLS above).
      const quality = await judgeQuality(result.output);
      const isStructural = STRUCTURAL_SKILLS.has(skill);

      const qualityPasses = isStructural
        ? quality.clarity >= MIN_QUALITY
        : quality.clarity >= MIN_QUALITY &&
          quality.completeness >= MIN_QUALITY &&
          quality.actionability >= MIN_QUALITY;

      const passed =
        result.exitReason === "success" &&
        outcome.passes_minimum &&
        qualityPasses;

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
      if (!isStructural) {
        // Substance skills must also be complete and actionable; structural
        // skills are exempt (their contract is the deterministic marker).
        expect(quality.completeness).toBeGreaterThanOrEqual(MIN_QUALITY);
        expect(quality.actionability).toBeGreaterThanOrEqual(MIN_QUALITY);
      }
    },
    TIMEOUT_MS,
  );
}

afterAll(async () => {
  await collector.finalize();
  assertNoBudgetRegressions(collector);
});
