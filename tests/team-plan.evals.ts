// tests/team-plan.evals.ts
//
// End-to-end eval for the team-plan (PLAN phase) skill. Paid tier — spawns a
// real `claude -p` subprocess and scores its output.
//
// File-level gating by NAME: the `.evals.ts` suffix is outside Bun's
// auto-discovery pattern, so `bun test` never loads this file unless targeted
// explicitly. Selection / tier gating goes through `testIfSelected`.
//
// Seeded-state mechanism (design Slice 4): the fixture input.md body embeds the
// upstream artifact (a structure.md) in a labeled fenced block. This
// file parses it out of `fixture.body` and writes it into the mkdtempSync
// workDir at docs/plans/<id>/structure.md BEFORE calling runAgentTest — no
// harness helper change. The deterministic axis confirms topic reuse +
// acceptance-test mapping; the gated LLM judge grades file-level step quality.
// Periodic tier: plan quality is a judgment with model-output variance.

import { afterAll } from "bun:test";
import { expect } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { EvalCollector, assertNoBudgetRegressions } from "./helpers/eval-store";
import { loadFixture } from "./helpers/fixtures";
import { judgeQuality, outcomeJudge } from "./helpers/llm-judge";
import { extractSeed } from "./helpers/seed";
import { runAgentTest } from "./helpers/session-runner";
import { testIfSelected } from "./helpers/touchfiles";

const collector = new EvalCollector("e2e");

const MIN_PLAN_QUALITY = 3;
// Topic id the seeded artifact lives under in the working dir. The slug
// portion (after the date prefix) MUST equal the topic embedded in the
// fixture seed — the assertion below makes drift fail loudly rather than
// silently working off a stale constant.
const TOPIC_ID = "2026-06-03-token-bucket";
const TOPIC_SLUG = "token-bucket";

testIfSelected(
  "team-plan-seeded-structure",
  async () => {
    const fixture = loadFixture("team-plan", "seeded-structure");
    const workDir = mkdtempSync(join(tmpdir(), "team-plan-e2e-"));

    try {
      const seed = extractSeed(fixture.body, "structure.md");
      expect(seed).not.toBeNull();
      // Drift guard: the working-dir TOPIC_SLUG must match the seed's topic.
      expect(seed).toContain(`topic: ${TOPIC_SLUG}`);
      const seedPath = join(workDir, "docs", "plans", TOPIC_ID, "structure.md");
      mkdirSync(dirname(seedPath), { recursive: true });
      writeFileSync(seedPath, `${seed}\n`, "utf8");

      const prompt =
        "You are running the PLAN phase against the seeded " +
        `docs/plans/${TOPIC_ID}/structure.md in your working directory. Read ` +
        "it, expand each slice into file-level steps with acceptance tests, " +
        "and reuse the topic slug.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 8,
        timeout: 180_000,
        testName: "team-plan-seeded-structure",
      });

      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      let planQuality = 1;
      if (outcome.passes_minimum) {
        const quality = await judgeQuality(result.output);
        planQuality = quality.completeness;
      }

      const passed =
        result.exitReason === "success" &&
        outcome.passes_minimum &&
        planQuality >= MIN_PLAN_QUALITY;

      collector.addTest({
        name: "team-plan-seeded-structure",
        suite: "team-plan-e2e",
        tier: "e2e",
        passed,
        duration_ms: result.duration,
        cost_usd: result.costEstimate.estimatedCost,
        transcript: result.transcript,
        judge_scores: {
          detection_rate: outcome.detection_rate,
          plan_quality: planQuality,
        },
        exit_reason: result.exitReason,
        model: result.model,
        first_response_ms: result.firstResponseMs,
        max_inter_turn_ms: result.maxInterTurnMs,
      });

      expect(result.exitReason).toBe("success");
      expect(outcome.detection_rate).toBeGreaterThanOrEqual(
        fixture.groundTruth.minimum_detection,
      );
      expect(planQuality).toBeGreaterThanOrEqual(MIN_PLAN_QUALITY);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  },
  240_000,
);

afterAll(async () => {
  await collector.finalize();
  assertNoBudgetRegressions(collector);
});
