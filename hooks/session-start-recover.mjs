/**
 * SessionStart hook — detects an active TEAM pipeline and prompts recovery.
 *
 * Reads .team/events.jsonl (the source of truth) and derives pipeline state.
 * Falls back to .team/state.json if the event log doesn't exist.
 * Injects a recovery notice into the session context so the agent knows
 * to suggest /team-resume.
 *
 * Contract: always exits 0. A missing or malformed state file is not an error.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { EVENT_TO_PHASE, deriveState, readEventLog, projectDir } from "../lib/events.mjs";

async function readStateFile() {
  const statePath = join(projectDir(), ".team", "state.json");

  try {
    const raw = await readFile(statePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatTestFiles(testFiles) {
  if (!Array.isArray(testFiles) || testFiles.length === 0) {
    return "none";
  }
  return testFiles.join(", ");
}

function detectPartialWork(events) {
  const eventNames = new Set(events.map((e) => e.event));
  const gaps = [];

  if (eventNames.has("files.found") && !eventNames.has("research.completed")) {
    gaps.push("Research started (files found) but not completed");
  }

  if (eventNames.has("plan.drafted") && !eventNames.has("plan.approved") && !eventNames.has("plan.revision-requested")) {
    gaps.push("Plan drafted but not yet reviewed");
  }

  if (eventNames.has("tests.confirmed-failing") && !eventNames.has("implementation.completed")) {
    gaps.push("Tests written but implementation not completed");
  }

  return gaps;
}

function formatRecoveryContext(state, events) {
  const lines = [
    "[TEAM Pipeline Recovery]",
    "An active TEAM pipeline was detected. Resume with /team-resume.",
    "",
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

  if (state.startedAt) {
    lines.push(`Started: ${state.startedAt}`);
  }

  if (events) {
    const lastEvent = events[events.length - 1];
    lines.push(`Event Count: ${events.length}`);
    lines.push(`Last Event: ${lastEvent.event} (seq=${lastEvent.seq})`);

    const gaps = detectPartialWork(events);
    if (gaps.length > 0) {
      lines.push("");
      lines.push("Partial Work Detected:");
      for (const gap of gaps) {
        lines.push(`  - ${gap}`);
      }
    }
  }

  lines.push("");
  lines.push("To resume: run /team-resume");
  lines.push("To abandon: delete .team/events.jsonl");

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

  const additionalContext = formatRecoveryContext(state, events);
  const output = JSON.stringify({ hookSpecificOutput: { additionalContext } });

  process.stderr.write(output + "\n");
  process.exit(0);
}

main();
