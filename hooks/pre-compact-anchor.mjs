/**
 * PreCompact hook — anchors TEAM pipeline state before context compaction.
 *
 * Reads the most recently modified ~/.team/<topic>/state.json and injects
 * a 4-line anchor into additionalContext. Always exits 0.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

async function findActiveSnapshot() {
  const base = join(homedir(), ".team");
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
          best = JSON.parse(await readFile(snapPath, "utf-8"));
          bestMtime = st.mtimeMs;
        }
      } catch { /* no snapshot here */ }
    }
    return best;
  } catch {
    return null;
  }
}

function formatAnchor(s) {
  return [
    "[TEAM Pipeline State -- Anchor before compaction]",
    `Phase: ${s.phase} | Topic: ${s.topic}`,
    `Counters: designRev=${s.designRevisionCount ?? 0} structureRev=${s.structureRevisionCount ?? 0} verifyRetry=${s.verificationRetryCount ?? 0}`,
    "Run /team-resume to continue the pipeline.",
  ].join("\n");
}

async function main() {
  const snapshot = await findActiveSnapshot();
  if (!snapshot || !snapshot.phase || snapshot.phase === "SHIPPED") {
    process.exit(0);
  }
  const output = JSON.stringify({ hookSpecificOutput: { additionalContext: formatAnchor(snapshot) } });
  process.stderr.write(output + "\n");
  process.exit(0);
}

main();
