/**
 * PreCompact hook — anchors TEAM pipeline state before context compaction.
 *
 * Reads .team/events.jsonl (the source of truth) and derives pipeline state.
 * Falls back to .team/state.json if the event log doesn't exist.
 * Injects a concise summary into the compacted context so the agent retains
 * awareness of the active pipeline.
 *
 * Contract: always exits 0. A missing or malformed state file is not an error.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

function projectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

async function readEventLog() {
  const logPath = join(projectDir(), ".team", "events.jsonl");

  try {
    const raw = await readFile(logPath, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.map((line) => JSON.parse(line));
  } catch {
    return null;
  }
}

async function readStateFile() {
  const statePath = join(projectDir(), ".team", "state.json");

  try {
    const raw = await readFile(statePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const EVENT_TO_PHASE = {
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

function deriveState(events) {
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
        state.currentStep = event.data?.stepId ?? null;
        break;
      case "hard-gate.failed":
        state.backwardTransitions += 1;
        break;
    }
  }

  return state;
}

function formatTestFiles(testFiles) {
  if (!Array.isArray(testFiles) || testFiles.length === 0) {
    return "none";
  }
  return testFiles.join(", ");
}

function formatRecentEvents(events, count) {
  const recent = events.slice(-count);
  return recent
    .map((e) => `  seq=${e.seq} ${e.event} (${e.ts})`)
    .join("\n");
}

function formatAnchorContext(state, events) {
  const lines = [
    "[TEAM Pipeline State -- Anchor before compaction]",
    `Phase: ${state.phase} | Topic: ${state.topic}`,
  ];

  if (state.planPath) {
    lines.push(`Plan: ${state.planPath}`);
  }

  if (state.currentStep) {
    lines.push(`Current Step: ${state.currentStep}`);
  }

  const transitions = state.backwardTransitions ?? 0;
  lines.push(`Backward Transitions: ${transitions}/3`);

  lines.push(`Test Files: ${formatTestFiles(state.testFiles)}`);

  if (events) {
    lines.push(`Event Count: ${events.length}`);
    lines.push(`Recent Events:\n${formatRecentEvents(events, 3)}`);
  }

  lines.push("Run /team-resume to continue the pipeline.");

  return lines.join("\n");
}

async function main() {
  let state = null;
  let events = null;

  const eventLog = await readEventLog();

  if (eventLog && eventLog.length > 0) {
    events = eventLog;
    state = deriveState(events);
  } else {
    state = await readStateFile();
  }

  if (!state || !state.phase) {
    process.exit(0);
  }

  const additionalContext = formatAnchorContext(state, events);
  const output = JSON.stringify({ hookSpecificOutput: { additionalContext } });

  process.stderr.write(output + "\n");
  process.exit(0);
}

main();
