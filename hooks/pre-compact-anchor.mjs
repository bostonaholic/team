/**
 * PreCompact hook — anchors TEAM pipeline state before compaction.
 * Scans docs/plans/<today>-<topic>-*.md for the most recent active
 * topic, infers the current phase from artifact presence + YAML
 * frontmatter, and injects a 4-line anchor into additionalContext.
 * Stateless; always exits 0.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const ARTIFACT_RE =
  /^(\d{4}-\d{2}-\d{2})-([a-z0-9_][a-z0-9_-]{0,99})-(task|research|design|structure|plan)\.md$/;

async function readStdinJSON() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf-8")); }
  catch { return {}; }
}

function projectDir(input) {
  return input?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

async function findActiveTopic(plansDir) {
  let entries;
  try { entries = await readdir(plansDir); } catch { return null; }
  let best = null, bestMtime = -Infinity;
  for (const name of entries) {
    const m = name.match(ARTIFACT_RE);
    if (!m) continue;
    try {
      const st = await stat(join(plansDir, name));
      if (st.mtimeMs > bestMtime) {
        bestMtime = st.mtimeMs;
        best = { date: m[1], topic: m[2] };
      }
    } catch { /* skip */ }
  }
  return best;
}

async function readFrontmatter(path) {
  try {
    const head = (await readFile(path, "utf-8")).split("\n", 60);
    if (head[0] !== "---") return {};
    const out = {};
    for (let i = 1; i < head.length; i++) {
      if (head[i] === "---") break;
      const m = head[i].match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.+?)\s*$/);
      if (m) out[m[1]] = m[2];
    }
    return out;
  } catch { return {}; }
}

const isTrue = (v) => v === "true" || v === true;

async function inferPhase(plansDir, { date, topic }) {
  const p = (kind) => join(plansDir, `${date}-${topic}-${kind}.md`);
  const has = async (path) => { try { await stat(path); return true; } catch { return false; } };
  if (await has(p("plan"))) return "WORKTREE";
  if (await has(p("structure"))) {
    return isTrue((await readFrontmatter(p("structure"))).approved) ? "PLAN" : "STRUCTURE";
  }
  if (await has(p("design"))) {
    return isTrue((await readFrontmatter(p("design"))).approved) ? "STRUCTURE" : "DESIGN";
  }
  if (await has(p("research"))) return "DESIGN";
  if (await has(p("task"))) return "RESEARCH";
  return null;
}

async function main() {
  const input = await readStdinJSON();
  const plansDir = join(projectDir(input), "docs", "plans");
  const active = await findActiveTopic(plansDir);
  if (!active) process.exit(0);
  const phase = await inferPhase(plansDir, active);
  if (!phase) process.exit(0);
  const ctx = [
    "[TEAM Pipeline State — Anchor before compaction]",
    `Phase: ${phase} | Topic: ${active.topic} | Date: ${active.date}`,
    `Latest artifact: docs/plans/${active.date}-${active.topic}-*.md`,
    "Re-invoke any /team-* command to pick up from the latest artifact.",
  ].join("\n");
  process.stderr.write(JSON.stringify({ hookSpecificOutput: { additionalContext: ctx } }) + "\n");
  process.exit(0);
}

main();
