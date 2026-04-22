/**
 * PreCompact hook — anchors TEAM pipeline state before context compaction.
 *
 * Scans ~/.team/ subdirectories for events.jsonl (per-session layout).
 * Falls back to flat ~/.team/events.jsonl if no subdirectories found.
 * Injects a concise summary into the compacted context so the agent retains
 * awareness of the active pipeline.
 *
 * Contract: always exits 0. A missing or malformed state file is not an error.
 */

import { readFile, readdir, stat } from "node:fs/promises";
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

/**
 * Scan ~/.team/<topic>/state.json across all topics, return the most
 * recently modified snapshot or null. Inlined here (not imported from
 * lib/state.mjs) to keep slice 3's revert surface minimal — dedupe and
 * hoisting happen in slice 7.
 */
async function findActiveSnapshot() {
  const base = teamDir();
  try {
    const entries = await readdir(base, { withFileTypes: true });
    let best = null;
    let bestMtime = -Infinity;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const snapPath = join(base, entry.name, "state.json");
      try {
        const st = await stat(snapPath);
        if (st.mtimeMs > bestMtime) {
          const raw = await readFile(snapPath, "utf-8");
          best = { topic: entry.name, snapshot: JSON.parse(raw) };
          bestMtime = st.mtimeMs;
        }
      } catch {
        // no snapshot for this topic
      }
    }
    return best;
  } catch {
    return null;
  }
}

function formatSnapshotAnchor(snapshot) {
  const designRev = snapshot.designRevisionCount ?? 0;
  const structureRev = snapshot.structureRevisionCount ?? 0;
  const verifyRetry = snapshot.verificationRetryCount ?? 0;
  return [
    "[TEAM Pipeline State -- Anchor before compaction]",
    `Phase: ${snapshot.phase} | Topic: ${snapshot.topic}`,
    `Counters: designRev=${designRev} structureRev=${structureRev} verifyRetry=${verifyRetry}`,
    "Run /team-resume to continue the pipeline.",
  ].join("\n");
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
  // Prefer state.json snapshot. Fall back to event-log replay.
  const active = await findActiveSnapshot();
  if (active && active.snapshot && active.snapshot.phase && active.snapshot.phase !== "SHIPPED") {
    const additionalContext = formatSnapshotAnchor(active.snapshot);
    const output = JSON.stringify({ hookSpecificOutput: { additionalContext } });
    process.stderr.write(output + "\n");
    process.exit(0);
  }

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

  const additionalContext = formatAnchorContext(state, events);
  const output = JSON.stringify({ hookSpecificOutput: { additionalContext } });

  process.stderr.write(output + "\n");
  process.exit(0);
}

main();
