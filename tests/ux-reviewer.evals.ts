// tests/ux-reviewer.evals.ts
//
// Periodic detection-rate eval for the ux-reviewer agent. The agent needs a
// startable surface, so the eval copies a checked-in static `surface.html`
// into the working directory and (in live mode) serves it on a local static
// server. Scored purely with the deterministic `outcomeJudge` — no LLM judge.
//
// Fail-loud setup contract: if the surface cannot be staged or the static
// server cannot start in live mode, the eval throws a clear setup error. It
// MUST NOT silently score zero detections on a setup failure.
//
// Mock seam (offline, no key, no cost):
//   EVALS_MOCK_AGENT=<path>   replay a recorded NDJSON transcript. In mock
//                             mode no real agent connects, so a live server is
//                             not required (the surface is still staged).

import { afterAll } from "bun:test";
import { expect } from "bun:test";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EvalCollector, assertNoBudgetRegressions } from "./helpers/eval-store";
import { loadFixture } from "./helpers/fixtures";
import { outcomeJudge } from "./helpers/llm-judge";
import { runAgentTest } from "./helpers/session-runner";
import { testIfSelected } from "./helpers/touchfiles";

const collector = new EvalCollector("e2e");

const FIXTURE_ROOT = "evals/fixtures/ux-reviewer";

interface StagedSurface {
  workDir: string;
  server: { stop: () => void } | null;
  url: string | null;
}

// Stage the checked-in surface into a fresh workdir and, in live mode, start a
// static server. Throws a clear setup error on any staging/start failure so a
// broken setup can never masquerade as a zero-detection result.
function stageSurface(testCase: string): StagedSurface {
  const sourceDir = join(FIXTURE_ROOT, testCase, "surface");
  const surfaceFile = join(sourceDir, "surface.html");
  if (!existsSync(surfaceFile)) {
    throw new Error(
      `ux-reviewer setup failed: missing surface asset at ${surfaceFile}`,
    );
  }

  const workDir = mkdtempSync(join(tmpdir(), `ux-reviewer-${testCase}-`));
  try {
    cpSync(sourceDir, workDir, { recursive: true });
  } catch (cause) {
    rmSync(workDir, { recursive: true, force: true });
    throw new Error(
      `ux-reviewer setup failed: could not copy surface into workdir`,
      { cause },
    );
  }

  // Mock mode: no real agent connects, so a live server is not required.
  const isMocked =
    process.env.EVALS_MOCK_AGENT !== undefined &&
    process.env.EVALS_MOCK_AGENT !== "";
  if (isMocked) {
    return { workDir, server: null, url: null };
  }

  let server: { stop: () => void };
  let port: number;
  try {
    const staged = startStaticServer(workDir);
    server = staged.server;
    port = staged.port;
  } catch (cause) {
    rmSync(workDir, { recursive: true, force: true });
    // Fail loud: a server we cannot start must not degrade into a 0 score.
    throw new Error(
      `ux-reviewer setup failed: static server did not start`,
      { cause },
    );
  }

  return { workDir, server, url: `http://localhost:${port}/surface.html` };
}

// Minimal static file server over the workdir, using Bun's built-in server.
function startStaticServer(rootDir: string): {
  server: { stop: () => void };
  port: number;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bun = (globalThis as any).Bun;
  if (bun === undefined || typeof bun.serve !== "function") {
    throw new Error("Bun.serve is unavailable; cannot host the static surface");
  }
  const server = bun.serve({
    port: 0,
    async fetch(req: Request): Promise<Response> {
      const path = new URL(req.url).pathname.replace(/^\/+/, "") || "surface.html";
      const file = bun.file(join(rootDir, path));
      if (!(await file.exists())) {
        return new Response("not found", { status: 404 });
      }
      return new Response(file);
    },
  });
  return { server: { stop: () => server.stop(true) }, port: server.port };
}

testIfSelected(
  "ux-reviewer-detects-a11y-defect",
  async () => {
    const fixture = loadFixture("ux-reviewer", "detects-a11y-defect");
    const staged = stageSurface("detects-a11y-defect");

    try {
      const prompt =
        "You are a UX and accessibility reviewer. Exercise the rendered " +
        "surface in this working directory and report each accessibility / " +
        "usability defect with a severity and a concrete remediation. " +
        "Reference WCAG criteria where relevant.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: staged.workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "ux-reviewer-detects-a11y-defect",
      });

      const outcome = outcomeJudge(fixture.groundTruth, result.output);

      const passed = result.exitReason === "success" && outcome.passes_minimum;

      collector.addTest({
        name: "ux-reviewer-detects-a11y-defect",
        suite: "ux-reviewer-e2e",
        tier: "e2e",
        passed,
        duration_ms: result.duration,
        cost_usd: result.costEstimate.estimatedCost,
        transcript: result.transcript,
        judge_scores: { detection_rate: outcome.detection_rate },
        exit_reason: result.exitReason,
        model: result.model,
        first_response_ms: result.firstResponseMs,
        max_inter_turn_ms: result.maxInterTurnMs,
      });

      expect(result.exitReason).toBe("success");
      expect(outcome.detection_rate).toBeGreaterThanOrEqual(
        fixture.groundTruth.minimum_detection,
      );
    } finally {
      staged.server?.stop();
      rmSync(staged.workDir, { recursive: true, force: true });
    }
  },
  240_000,
);

testIfSelected(
  "ux-reviewer-clean-surface",
  async () => {
    const fixture = loadFixture("ux-reviewer", "clean-surface");
    const staged = stageSurface("clean-surface");

    try {
      const prompt =
        "You are a UX and accessibility reviewer. Exercise the rendered " +
        "surface in this working directory and report each accessibility / " +
        "usability defect with a severity and a concrete remediation. Do NOT " +
        "flag a surface that is already accessible.\n\n" +
        fixture.body;

      const result = await runAgentTest({
        prompt,
        workingDirectory: staged.workDir,
        maxTurns: 6,
        timeout: 180_000,
        testName: "ux-reviewer-clean-surface",
      });

      // FP guard: the surface is already accessible. A correct reviewer does
      // NOT flag the planted defects, so both bug ids must be MISSED and the
      // count of "detected" findings must respect max_false_positives.
      const outcome = outcomeJudge(fixture.groundTruth, result.output);
      const maxFalsePositives = fixture.groundTruth.max_false_positives ?? 0;

      const passed =
        result.exitReason === "success" &&
        outcome.missed.includes("u1") &&
        outcome.missed.includes("u2") &&
        outcome.detected.length <= maxFalsePositives;

      collector.addTest({
        name: "ux-reviewer-clean-surface",
        suite: "ux-reviewer-e2e",
        tier: "e2e",
        passed,
        duration_ms: result.duration,
        cost_usd: result.costEstimate.estimatedCost,
        transcript: result.transcript,
        judge_scores: { detection_rate: outcome.detection_rate },
        exit_reason: result.exitReason,
        model: result.model,
        first_response_ms: result.firstResponseMs,
        max_inter_turn_ms: result.maxInterTurnMs,
      });

      expect(result.exitReason).toBe("success");
      expect(outcome.missed).toContain("u1");
      expect(outcome.missed).toContain("u2");
      expect(outcome.detected.length).toBeLessThanOrEqual(maxFalsePositives);
    } finally {
      staged.server?.stop();
      rmSync(staged.workDir, { recursive: true, force: true });
    }
  },
  240_000,
);

afterAll(async () => {
  await collector.finalize();
  assertNoBudgetRegressions(collector);
});
