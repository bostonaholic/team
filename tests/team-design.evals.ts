// tests/team-design.evals.ts
//
// End-to-end eval for the team-design (DESIGN phase) skill. Paid tier — spawns
// a real `claude -p` subprocess and scores its output.
//
// File-level gating by NAME: the `.evals.ts` suffix is outside Bun's
// auto-discovery pattern, so `bun test` never loads this file unless targeted
// explicitly. Selection / tier gating goes through `testIfSelected`.
//
// Seeded-state mechanism (design Slice 3): the fixture input.md body embeds two
// upstream artifacts (task.md + research.md) in labeled fenced blocks. This
// file parses them out of `fixture.body` and writes them into the mkdtempSync
// workDir at docs/plans/<id>/{task,research}.md BEFORE calling runAgentTest —
// no harness helper change. The deterministic axis confirms the topic slug was
// reused and an Open Questions section is present; the gated LLM judge grades
// design grounding. Periodic tier: grounding is a judgment with model variance.

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

const MIN_GROUNDING = 3;
// Topic id the seeded artifacts live under in the working dir. The slug
// portion (after the date prefix) MUST equal the topic embedded in the
// fixture seeds — the assertion below makes drift fail loudly rather than
// silently working off a stale constant.
const TOPIC_ID = "2026-06-03-token-bucket";
const TOPIC_SLUG = "token-bucket";

function seedFile(workDir: string, relativePath: string, content: string): void {
  const path = join(workDir, "docs", "plans", TOPIC_ID, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${content}\n`, "utf8");
}

testIfSelected(
  "team-design-seeded-research-and-task",
  async () => {
    const fixture = loadFixture("team-design", "seeded-research-and-task");
    const workDir = mkdtempSync(join(tmpdir(), "team-design-e2e-"));

    try {
      // Seed both upstream artifacts into the working dir before spawning.
      const task = extractSeed(fixture.body, "task.md");
      const research = extractSeed(fixture.body, "research.md");
      expect(task).not.toBeNull();
      expect(research).not.toBeNull();
      // Drift guard: the working-dir TOPIC_SLUG must match the seeds' topic.
      expect(task).toContain(`topic: ${TOPIC_SLUG}`);
      expect(research).toContain(`topic: ${TOPIC_SLUG}`);
      seedFile(workDir, "task.md", task as string);
      seedFile(workDir, "research.md", research as string);

      const prompt =
        "You are running the DESIGN phase against the seeded " +
        `docs/plans/${TOPIC_ID}/{task,research}.md in your working ` +
        "directory. Read them, draft the design, reuse the topic slug, and " +
        "list explicit open questions.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 8,
        timeout: 180_000,
        testName: "team-design-seeded-research-and-task",
      });

      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      let grounding = 1;
      if (outcome.passes_minimum) {
        const quality = await judgeQuality(result.output);
        grounding = quality.completeness;
      }

      const passed =
        result.exitReason === "success" &&
        outcome.passes_minimum &&
        grounding >= MIN_GROUNDING;

      collector.addTest({
        name: "team-design-seeded-research-and-task",
        suite: "team-design-e2e",
        tier: "e2e",
        passed,
        duration_ms: result.duration,
        cost_usd: result.costEstimate.estimatedCost,
        transcript: result.transcript,
        judge_scores: {
          detection_rate: outcome.detection_rate,
          grounding,
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
      expect(grounding).toBeGreaterThanOrEqual(MIN_GROUNDING);
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
