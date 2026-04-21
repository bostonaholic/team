/**
 * Shared event library for the TEAM pipeline (QRSPI workflow).
 *
 * Extracted from hooks/session-start-recover.mjs and hooks/pre-compact-anchor.mjs
 * so that both hooks and the Teamflow dashboard can import from a single source.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export function projectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

/** Global event log directory — shared across all worktrees. */
export function teamDir() {
  return join(homedir(), ".team");
}

/** Per-session event log directory: ~/.team/<topic>/ */
export function sessionDir(topic) {
  return join(teamDir(), topic);
}

export async function readEventLog(dir) {
  const root = dir || teamDir();
  const logPath = join(root, "events.jsonl");

  try {
    const raw = await readFile(logPath, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.map((line) => JSON.parse(line));
  } catch {
    return null;
  }
}

export const EVENT_TO_PHASE = {
  "feature.requested": "QUESTION",
  "bug.reported": "QUESTION",
  "task.captured": "RESEARCH",
  "files.found": "RESEARCH",
  "research.completed": "DESIGN",
  "design.drafted": "DESIGN",
  "design.approved": "STRUCTURE",
  "design.revision-requested": "DESIGN",
  "structure.drafted": "STRUCTURE",
  "structure.approved": "PLAN",
  "structure.revision-requested": "STRUCTURE",
  "plan.drafted": "WORKTREE",
  "worktree.prepared": "IMPLEMENT",
  "tests.written": "IMPLEMENT",
  "tests.confirmed-failing": "IMPLEMENT",
  "slice.completed": "IMPLEMENT",
  "implementation.completed": "IMPLEMENT",
  "review.completed": "IMPLEMENT",
  "security-review.completed": "IMPLEMENT",
  "docs-review.completed": "IMPLEMENT",
  "ux-review.completed": "IMPLEMENT",
  "verification.completed": "IMPLEMENT",
  "hard-gate.security-failed": "IMPLEMENT",
  "hard-gate.lint-failed": "IMPLEMENT",
  "hard-gate.typecheck-failed": "IMPLEMENT",
  "hard-gate.build-failed": "IMPLEMENT",
  "hard-gate.test-failed": "IMPLEMENT",
  "hard-gate.review-failed": "IMPLEMENT",
  "verification.passed": "PR",
  "feature.shipped": "SHIPPED",
};

export function deriveState(events) {
  const state = {
    phase: null,
    topic: null,
    beadsId: null,
    startedAt: null,
    taskPath: null,
    questionsPath: null,
    briefPath: null,
    researchPath: null,
    designPath: null,
    structurePath: null,
    planPath: null,
    worktreePath: null,
    currentSlice: null,
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
        state.beadsId = event.data?.beadsId ?? null;
        break;
      case "bug.reported":
        state.startedAt = event.ts ?? null;
        state.beadsId = event.data?.beadsId ?? null;
        break;
      case "task.captured":
        state.taskPath = event.data?.taskPath ?? null;
        state.questionsPath = event.data?.questionsPath ?? null;
        state.briefPath = event.data?.briefPath ?? null;
        break;
      case "research.completed":
        state.researchPath = event.artifact ?? null;
        break;
      case "design.drafted":
        state.designPath = event.artifact ?? null;
        break;
      case "structure.drafted":
        state.structurePath = event.artifact ?? null;
        break;
      case "plan.drafted":
        state.planPath = event.artifact ?? null;
        break;
      case "worktree.prepared":
        state.worktreePath = event.data?.worktreePath ?? null;
        break;
      case "tests.confirmed-failing":
        state.testFiles = event.data?.testFiles ?? null;
        break;
      case "slice.completed":
        state.currentSlice = event.data?.slice ?? null;
        break;
      case "hard-gate.security-failed":
      case "hard-gate.lint-failed":
      case "hard-gate.typecheck-failed":
      case "hard-gate.build-failed":
      case "hard-gate.test-failed":
      case "hard-gate.review-failed":
        state.backwardTransitions += 1;
        break;
    }
  }

  return state;
}
