/**
 * PreCompact hook — anchors TEAM pipeline state before compaction.
 * Reads the most recent ~/.team/<topic>/state.json, injects a 4-line
 * anchor into additionalContext. Stateless; always exits 0.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const TOPIC_RE = /^[a-z0-9_][a-z0-9_-]{0,99}$/;
const PHASES = new Set(["QUESTION","RESEARCH","DESIGN","STRUCTURE",
  "PLAN","WORKTREE","IMPLEMENT","PR","SHIPPED"]);
const int0 = (v) => Number.isInteger(v) ? v : 0;

async function findActiveSnapshot() {
  const base = join(homedir(), ".team");
  try {
    const entries = await readdir(base, { withFileTypes: true });
    let best = null, bestMtime = -Infinity;
    for (const e of entries) {
      if (!e.isDirectory() || !TOPIC_RE.test(e.name)) continue;
      const p = join(base, e.name, "state.json");
      try {
        const st = await stat(p);
        if (st.mtimeMs > bestMtime) {
          best = JSON.parse(await readFile(p, "utf-8"));
          bestMtime = st.mtimeMs;
        }
      } catch { /* skip */ }
    }
    return best;
  } catch { return null; }
}

function formatAnchor(s) {
  if (!PHASES.has(s.phase)) return null;
  if (typeof s.topic !== "string" || !TOPIC_RE.test(s.topic)) return null;
  return [
    "[TEAM Pipeline State -- Anchor before compaction]",
    `Phase: ${s.phase} | Topic: ${s.topic}`,
    `Counters: designRev=${int0(s.designRevisionCount)} structureRev=${int0(s.structureRevisionCount)} verifyRetry=${int0(s.verificationRetryCount)}`,
    "Run /team-resume to continue the pipeline.",
  ].join("\n");
}

async function main() {
  const s = await findActiveSnapshot();
  if (!s || s.phase === "SHIPPED") process.exit(0);
  const ctx = formatAnchor(s);
  if (!ctx) process.exit(0);
  process.stderr.write(JSON.stringify({ hookSpecificOutput: { additionalContext: ctx } }) + "\n");
  process.exit(0);
}

main();
