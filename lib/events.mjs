/**
 * Shared event library for the TEAM pipeline.
 *
 * Extracted from hooks/session-start-recover.mjs and hooks/pre-compact-anchor.mjs
 * so that both hooks and the Teamflow dashboard can import from a single source.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function projectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

export async function readEventLog(dir) {
  const root = dir || projectDir();
  const logPath = join(root, ".team", "events.jsonl");

  try {
    const raw = await readFile(logPath, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.map((line) => JSON.parse(line));
  } catch {
    return null;
  }
}

export const EVENT_TO_PHASE = {
  "feature.requested": "RESEARCH",
  "research.completed": "PLAN",
  "plan.drafted": "PLAN",
  "plan.approved": "TEST-FIRST",
  "plan.revision-requested": "PLAN",
  "tests.confirmed-failing": "IMPLEMENT",
  "implementation.completed": "VERIFY",
  "hard-gate.failed": "IMPLEMENT",
  "verification.passed": "SHIP",
  "feature.shipped": "SHIPPED",
};

export function deriveState(events) {
  const state = {
    phase: null,
    topic: null,
    startedAt: null,
    planPath: null,
    researchPath: null,
    currentStep: null,
    testFiles: null,
    backwardTransitions: 0,
  };

  for (const event of events) {
    const phase = EVENT_TO_PHASE[event.event];

    if (phase !== undefined) {
      state.phase = phase;
    }

    switch (event.event) {
      case "feature.requested":
        state.topic = event.data?.topic ?? null;
        state.startedAt = event.ts ?? null;
        break;
      case "research.completed":
        state.researchPath = event.artifact ?? null;
        break;
      case "plan.drafted":
        state.planPath = event.artifact ?? null;
        break;
      case "tests.confirmed-failing":
        state.testFiles = event.data?.testFiles ?? null;
        break;
      case "step.completed":
        state.currentStep = event.data?.step ?? null;
        break;
      case "hard-gate.failed":
        state.backwardTransitions += 1;
        break;
    }
  }

  return state;
}
