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
      const snapPath = join(base, entry.name, "state.json");
      try {
        const st = await stat(snapPath);
        if (st.mtimeMs > bestMtime) {
          const raw = await readFile(snapPath, "utf-8");
          best = JSON.parse(raw);
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

function formatRecoveryContext(snapshot) {
  const designRev = snapshot.designRevisionCount ?? 0;
  const structureRev = snapshot.structureRevisionCount ?? 0;
  const verifyRetry = snapshot.verificationRetryCount ?? 0;
  const lines = [
    "[TEAM Pipeline Recovery]",
    "An active TEAM pipeline was detected. Resume with /team-resume.",
    "",
    `Phase: ${snapshot.phase} | Topic: ${snapshot.topic}`,
    `Counters: designRev=${designRev} structureRev=${structureRev} verifyRetry=${verifyRetry}`,
  ];
  if (snapshot.startedAt) lines.push(`Started: ${snapshot.startedAt}`);
  lines.push("To resume: run /team-resume");
  return lines.join("\n");
}

async function main() {
  const snapshot = await findActiveSnapshot();
  if (!snapshot || !snapshot.phase || snapshot.phase === "SHIPPED") {
    process.exit(0);
  }
  const additionalContext = formatRecoveryContext(snapshot);
  const output = JSON.stringify({ hookSpecificOutput: { additionalContext } });
  process.stderr.write(output + "\n");
  process.exit(0);
}

main();
