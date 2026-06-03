// tests/team-research.evals.ts
//
// End-to-end eval for the team-research (RESEARCH phase) skill. Paid tier —
// spawns a real `claude -p` subprocess and scores its output.
//
// File-level gating by NAME: the `.evals.ts` suffix is outside Bun's
// auto-discovery pattern, so `bun test` never loads this file unless targeted
// explicitly. Selection / tier gating goes through `testIfSelected`.
//
// Seeded-state mechanism (design Slice 3): the fixture input.md body embeds the
// upstream artifact (questions.md) in a labeled fenced block. This file parses
// that block out of `fixture.body` and writes it into the mkdtempSync workDir
// at docs/plans/<id>/questions.md BEFORE calling runAgentTest — no harness
// helper change. The deterministic axis confirms the topic slug was reused
// verbatim; the gated LLM judge grades research-fact grounding. Periodic tier:
// grounding is a judgment with model-output variance.

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

const MIN_GROUNDING = 3;

// Topic id the seeded artifact lives under in the working dir.
const TOPIC_ID = "2026-06-03-token-bucket";

// Parse a labeled fenced block out of a fixture body. The fence opener is
// ```<lang> <relativePath> and the content runs to the next ``` line. Returns
// the inner text, or null when the labeled block is absent.
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
  "team-research-answers-seeded-questions",
  async () => {
    const fixture = loadFixture("team-research", "answers-seeded-questions");
    const workDir = mkdtempSync(join(tmpdir(), "team-research-e2e-"));

    try {
      // Seed the upstream artifact into the working dir before spawning.
      const seed = extractSeed(fixture.body, "questions.md");
      expect(seed).not.toBeNull();
      const seedPath = join(workDir, "docs", "plans", TOPIC_ID, "questions.md");
      mkdirSync(dirname(seedPath), { recursive: true });
      writeFileSync(seedPath, `${seed}\n`, "utf8");

      const prompt =
        "You are running the RESEARCH phase against the seeded " +
        `docs/plans/${TOPIC_ID}/questions.md in your working directory. ` +
        "Read it, answer its questions against this codebase, and reuse its " +
        "topic slug verbatim.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: workDir,
        maxTurns: 8,
        timeout: 180_000,
        testName: "team-research-answers-seeded-questions",
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
        name: "team-research-answers-seeded-questions",
        suite: "team-research-e2e",
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
