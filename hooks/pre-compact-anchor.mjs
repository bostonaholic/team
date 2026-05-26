/**
 * PreCompact hook — anchors Team pipeline state before compaction.
 * Scans docs/plans/<id>/ subdirectories for the most recent active
 * topic, infers the current phase from artifact presence + YAML
 * frontmatter, and injects a 4-line anchor into additionalContext.
 * The anchor tells the agent to re-invoke any /team-* command bare —
 * discovery auto-resolves the directory (an explicit docs/plans/<id>/
 * is still accepted). Stateless; always exits 0.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const ID_RE = /^([A-Za-z][A-Za-z0-9_]*-\d+|\d{4}-\d{2}-\d{2})-[a-z0-9][a-z0-9-]*$/;
const PHASE_FILES = ["task", "questions", "research", "design", "structure", "plan"];

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
  try { entries = await readdir(plansDir, { withFileTypes: true }); } catch { return null; }
  let best = null, bestMtime = -Infinity;
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (!ID_RE.test(ent.name)) continue;
    const dir = join(plansDir, ent.name);
    let dirMtime = -Infinity;
    for (const phase of PHASE_FILES) {
      try {
        const st = await stat(join(dir, `${phase}.md`));
        if (st.mtimeMs > dirMtime) dirMtime = st.mtimeMs;
      } catch { /* skip */ }
    }
    if (dirMtime > bestMtime) {
      bestMtime = dirMtime;
      best = { id: ent.name, dir };
    }
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

async function inferPhase(dir) {
  const p = (kind) => join(dir, `${kind}.md`);
  const has = async (path) => { try { await stat(path); return true; } catch { return false; } };
  if (await has(p("plan"))) return "WORKTREE";
  if (await has(p("structure"))) {
    return isTrue((await readFrontmatter(p("structure"))).approved) ? "PLAN" : "STRUCTURE";
  }
  if (await has(p("design"))) {
    return isTrue((await readFrontmatter(p("design"))).approved) ? "STRUCTURE" : "DESIGN";
  }
  if (await has(p("research"))) return "DESIGN";
  if (await has(p("questions")) || await has(p("task"))) return "RESEARCH";
  return null;
}

async function main() {
  const input = await readStdinJSON();
  const plansDir = join(projectDir(input), "docs", "plans");
  const active = await findActiveTopic(plansDir);
  if (!active) process.exit(0);
  const phase = await inferPhase(active.dir);
  if (!phase) process.exit(0);
  const ctx = [
    "[Team Pipeline State — Anchor before compaction]",
    `Phase: ${phase} | Id: ${active.id}`,
    `Artifact directory: docs/plans/${active.id}/`,
    `To continue: re-invoke any /team-* command bare (discovery auto-resolves the directory; an explicit docs/plans/${active.id}/ is still accepted).`,
  ].join("\n");
  process.stderr.write(JSON.stringify({ hookSpecificOutput: { additionalContext: ctx } }) + "\n");
  process.exit(0);
}

main();
