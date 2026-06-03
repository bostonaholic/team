// tests/team-structure.evals.ts
//
// End-to-end eval for the team-structure (STRUCTURE phase) skill. Paid tier —
// spawns a real `claude -p` subprocess and scores its output.
//
// File-level gating by NAME: the `.evals.ts` suffix is outside Bun's
// auto-discovery pattern, so `bun test` never loads this file unless targeted
// explicitly. Selection / tier gating goes through `testIfSelected`.
//
// Seeded-state mechanism (design Slice 4): the fixture input.md body embeds the
// upstream artifact (an approved design.md) in a labeled fenced block. This
// file parses it out of `fixture.body` and writes it into the mkdtempSync
// workDir at docs/plans/<id>/design.md BEFORE calling runAgentTest — no harness
// helper change. The deterministic axis confirms topic reuse + verification
// checkpoints; the gated LLM judge grades vertical-slice quality. Periodic
// tier: slice quality is a judgment with model-output variance.

import { afterAll } from "bun:test";
import { expect } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { EvalCollector, assertNoBudgetRegressions } from "./helpers/eval-store";
import { loadFixture } from "./helpers/fixtures";
import { judgeQuality, outcomeJudge } from "./helpers/llm-judge";
import { runAgentTest } from "./helpers/session-runner";
import { testIfSelected } from "./helpers/touchfiles";

const collector = new EvalCollector("e2e");

const MIN_SLICE_QUALITY = 3;
const TOPIC_ID = "2026-06-03-token-bucket";

// Parse a labeled fenced block out of a fixture body. The fence opener is
// ```<lang> <relativePath> and the content runs to the next ``` line.
function extractSeed(body: string, relativePath: string): string | null {
  const lines = body.split("\n");
  let inBlock = false;
  const out: string[] = [];
  for (const line of lines) {
    if (!inBlock) {
      const open = /^```[A-Za-z0-9_-]*\s+(\S+)\s*$/.exec(line);
      if (open && open[1] === relativePath) {
        inBlock = true;
      }
      continue;
    }
    if (/^```\s*$/.test(line)) break;
    out.push(line);
  }
  return inBlock ? out.join("\n") : null;
}

testIfSelected(
  "team-structure-seeded-design",
  async () => {
    const fixture = loadFixture("team-structure", "seeded-design");
    const workDir = mkdtempSync(join(tmpdir(), "team-structure-e2e-"));

    try {
      const seed = extractSeed(fixture.body, "design.md");
      expect(seed).not.toBeNull();
      const seedPath = join(workDir, "docs", "plans", TOPIC_ID, "design.md");
      mkdirSync(dirname(seedPath), { recursive: true });
      writeFileSync(seedPath, `${seed}\n`, "utf8");

      const prompt =
        "You are running the STRUCTURE phase against the seeded approved " +
        `docs/plans/${TOPIC_ID}/design.md in your working directory. Read ` +
        "it, slice the work into vertical slices each with a verification " +
        "checkpoint, and reuse the topic slug.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 8,
        timeout: 180_000,
        testName: "team-structure-seeded-design",
      });

      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      let sliceQuality = 1;
      if (outcome.passes_minimum) {
        const quality = await judgeQuality(result.output);
        sliceQuality = quality.completeness;
      }

      const passed =
        result.exitReason === "success" &&
        outcome.passes_minimum &&
        sliceQuality >= MIN_SLICE_QUALITY;

      collector.addTest({
        name: "team-structure-seeded-design",
        suite: "team-structure-e2e",
        tier: "e2e",
        passed,
        duration_ms: result.duration,
        cost_usd: result.costEstimate.estimatedCost,
        transcript: result.transcript,
        judge_scores: {
          detection_rate: outcome.detection_rate,
          slice_quality: sliceQuality,
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
      expect(sliceQuality).toBeGreaterThanOrEqual(MIN_SLICE_QUALITY);
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
