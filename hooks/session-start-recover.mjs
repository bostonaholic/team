/**
 * SessionStart hook — detects an active TEAM pipeline and prompts recovery.
 *
 * Reads ~/.team/<topic>/state.json (the most recently modified snapshot)
 * and injects a recovery notice into additionalContext so the agent knows
 * to suggest /team-resume.
 *
 * Contract: always exits 0. Missing or malformed snapshot is not an error.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

// Inlined (not imported) to keep hooks stateless and self-contained.
const TOPIC_RE = /^[a-z0-9_][a-z0-9_-]{0,99}$/;
const PHASES = new Set([
  "QUESTION", "RESEARCH", "DESIGN", "STRUCTURE",
  "PLAN", "WORKTREE", "IMPLEMENT", "PR", "SHIPPED",
]);
const int0 = (v) => Number.isInteger(v) ? v : 0;

function teamDir() {
  return join(homedir(), ".team");
}

async function findActiveSnapshot() {
  const base = teamDir();
  try {
    const entries = await readdir(base, { withFileTypes: true });
    let best = null;
    let bestMtime = -Infinity;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!TOPIC_RE.test(entry.name)) continue;
      const snapPath = join(base, entry.name, "state.json");
      try {
        const st = await stat(snapPath);
        if (st.mtimeMs > bestMtime) {
          best = JSON.parse(await readFile(snapPath, "utf-8"));
          bestMtime = st.mtimeMs;
        }
      } catch { /* no snapshot for this topic */ }
    }
    return best;
  } catch {
    return null;
  }
}

function formatRecoveryContext(s) {
  if (!PHASES.has(s.phase)) return null;
  if (typeof s.topic !== "string" || !TOPIC_RE.test(s.topic)) return null;
  const dr = int0(s.designRevisionCount);
  const sr = int0(s.structureRevisionCount);
  const vr = int0(s.verificationRetryCount);
  const lines = [
    "[TEAM Pipeline Recovery]",
    "An active TEAM pipeline was detected. Resume with /team-resume.",
    "",
    `Phase: ${s.phase} | Topic: ${s.topic}`,
    `Counters: designRev=${dr} structureRev=${sr} verifyRetry=${vr}`,
  ];
  if (typeof s.startedAt === "string") lines.push(`Started: ${s.startedAt}`);
  lines.push("To resume: run /team-resume");
  return lines.join("\n");
}

async function main() {
  const snapshot = await findActiveSnapshot();
  if (!snapshot || snapshot.phase === "SHIPPED") process.exit(0);
  const ctx = formatRecoveryContext(snapshot);
  if (!ctx) process.exit(0);
  const output = JSON.stringify({ hookSpecificOutput: { additionalContext: ctx } });
  process.stderr.write(output + "\n");
  process.exit(0);
}

main();
