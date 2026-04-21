/**
 * SessionStart hook — detects an active TEAM pipeline and prompts recovery.
 *
 * Scans ~/.team/ subdirectories for events.jsonl (per-session layout).
 * Falls back to flat ~/.team/events.jsonl if no subdirectories found.
 * Injects a recovery notice into the session context so the agent knows
 * to suggest /team-resume.
 *
 * Contract: always exits 0. A missing or malformed state file is not an error.
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { EVENT_TO_PHASE, deriveState, readEventLog, teamDir } from "../lib/events.mjs";

async function readStateFile() {
  const statePath = join(teamDir(), "state.json");

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

  // Shipped pipelines have no partial work by definition.
  if (eventNames.has("feature.shipped")) return gaps;

  if (eventNames.has("task.captured") && !eventNames.has("research.completed")) {
    gaps.push("Question phase done but research not completed");
  }

  if (eventNames.has("files.found") && !eventNames.has("research.completed")) {
    gaps.push("Research started (files found) but not completed");
  }

  if (eventNames.has("design.drafted") && !eventNames.has("design.approved") && !eventNames.has("design.revision-requested")) {
    gaps.push("Design drafted but awaiting human approval");
  }

  if (eventNames.has("structure.drafted") && !eventNames.has("structure.approved") && !eventNames.has("structure.revision-requested")) {
    gaps.push("Structure drafted but awaiting human approval");
  }

  if (eventNames.has("plan.drafted") && !eventNames.has("worktree.prepared")) {
    gaps.push("Plan drafted but worktree not prepared");
  }

  if (eventNames.has("tests.confirmed-failing") && !eventNames.has("implementation.completed")) {
    gaps.push("Tests written but implementation not completed");
  }

  if (eventNames.has("implementation.completed") && !eventNames.has("verification.passed")) {
    gaps.push("Implementation completed but verification not passed");
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

  if (state.beadsId) {
    lines.push(`Beads Issue: ${state.beadsId} (in progress)`);
  }

  if (state.planPath) {
    lines.push(`Plan: ${state.planPath}`);
  }

  if (state.currentStep) {
    lines.push(`Current Step: ${state.currentStep}`);
  }

  const transitions = state.backwardTransitions ?? 0;
  lines.push(`Backward Transitions: ${transitions}/5`);

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
  lines.push("To abandon: delete ~/.team/<topic>/events.jsonl");

  return lines.join("\n");
}

/**
 * Scan ~/.team/ subdirectories for the most recently active session.
 * Falls back to flat ~/.team/events.jsonl if no subdirectories found.
 */
async function findActiveSession() {
  const base = teamDir();

  try {
    const entries = await readdir(base, { withFileTypes: true });
    let bestEvents = null;
    let bestState = null;
    let bestTs = null;

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subdir = join(base, entry.name);
        const eventLog = await readEventLog(subdir);
        if (eventLog && eventLog.length > 0) {
          const lastTs = eventLog[eventLog.length - 1].ts;
          if (bestTs === null || lastTs > bestTs) {
            bestTs = lastTs;
            bestEvents = eventLog;
            bestState = deriveState(eventLog);
          }
        }
      }
    }

    if (bestEvents) {
      return { state: bestState, events: bestEvents };
    }
  } catch {
    // ~/.team/ may not exist
  }

  // Fall back to flat file
  const eventLog = await readEventLog();
  if (eventLog && eventLog.length > 0) {
    return { state: deriveState(eventLog), events: eventLog };
  }

  return null;
}

async function main() {
  let state = null;
  let events = null;

  const session = await findActiveSession();

  if (session) {
    state = session.state;
    events = session.events;
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
