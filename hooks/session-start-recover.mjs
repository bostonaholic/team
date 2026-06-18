/**
 * SessionStart hook — detects an active Team pipeline and prompts recovery.
 *
 * Scans the home docs/plans/<id>/ subdirectories plus every git worktree's
 * docs/plans/<id>/ for the most recent active topic, infers the current phase
 * from artifact presence + git signals (a leading WORKTREE state when a
 * worktree exists with no task.md yet; IMPLEMENT once >=1 commit lands on the
 * <id> branch), and injects a recovery notice into additionalContext so the
 * agent suggests re-invoking any /team-* command bare — discovery
 * auto-resolves the directory (an explicit docs/plans/<id>/ is still accepted).
 *
 * Contract: always exits 0. Missing or unparseable artifacts are not an error;
 * every git call is wrapped so git-absent / not-a-repo degrades to a home scan.
 */

import { execFileSync } from "node:child_process";
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

// Absolute paths of every git worktree, parsed from `git worktree list
// --porcelain`. Wrapped so a missing git binary or a non-repo cwd degrades
// to an empty list — the caller then scans only the home docs/plans/.
function worktreePaths(rootDir) {
  try {
    const out = execFileSync("git", ["-C", rootDir, "worktree", "list", "--porcelain"], {
      encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"],
    });
    const paths = [];
    for (const line of out.split("\n")) {
      if (line.startsWith("worktree ")) paths.push(line.slice("worktree ".length).trim());
    }
    return paths;
  } catch { return []; }
}

// True when branch <id> carries at least one commit since its merge-base with
// the default branch — the signal that IMPLEMENT has begun. Any git error
// (no such branch, no merge-base, git absent) degrades to false.
function hasImplCommit(rootDir, id) {
  try {
    const base = execFileSync("git", ["-C", rootDir, "merge-base", "HEAD", id], {
      encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!base) return false;
    const log = execFileSync("git", ["-C", rootDir, "log", "--oneline", `${base}..${id}`], {
      encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return log.length > 0;
  } catch { return false; }
}

// Scan the home docs/plans/ plus each worktree's docs/plans/ for the most
// recently touched topic. Candidates are deduped by <id>; the tiebreak is the
// max mtime over PHASE_FILES. On any git error the worktree set is empty and
// only the home tree is scanned.
async function findActiveTopic(rootDir) {
  const seen = new Map();
  const roots = [rootDir, ...worktreePaths(rootDir).filter((p) => p !== rootDir)];
  for (const root of roots) {
    const plansDir = join(root, "docs", "plans");
    let entries;
    try { entries = await readdir(plansDir, { withFileTypes: true }); } catch { continue; }
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
      const prev = seen.get(ent.name);
      if (!prev || dirMtime > prev.mtime) seen.set(ent.name, { id: ent.name, dir, mtime: dirMtime });
    }
  }
  let best = null, bestMtime = -Infinity;
  for (const cand of seen.values()) {
    if (cand.mtime > bestMtime) { bestMtime = cand.mtime; best = { id: cand.id, dir: cand.dir }; }
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

// Infer the current phase from artifact presence + git signals. `rootDir` is
// the home repo root (for git queries); `id` is the active topic; `hasWorktree`
// is true when a worktree exists for branch <id>.
async function inferPhase(dir, rootDir, id, hasWorktree) {
  const p = (kind) => join(dir, `${kind}.md`);
  const has = async (path) => { try { await stat(path); return true; } catch { return false; } };
  // Leading phase: a worktree exists for <id> but no task.md has been authored.
  if (hasWorktree && !(await has(p("task")))) return "WORKTREE";
  if (await has(p("plan"))) {
    // plan.md present: IMPLEMENT once >=1 commit lands on <id>; otherwise the
    // run is still pre-IMPLEMENT — fall through to the artifact-derived phase.
    if (hasImplCommit(rootDir, id)) return "IMPLEMENT";
  }
  if (await has(p("structure"))) return "PLAN";   // structure is not gated; advances to PLAN
  if (await has(p("design"))) {
    return isTrue((await readFrontmatter(p("design"))).approved) ? "STRUCTURE" : "DESIGN";
  }
  if (await has(p("research"))) return "DESIGN";
  if (await has(p("questions")) || await has(p("task"))) return "RESEARCH";
  return null;
}

async function main() {
  const input = await readStdinJSON();
  const rootDir = projectDir(input);
  const active = await findActiveTopic(rootDir);
  if (!active) process.exit(0);
  const hasWorktree = worktreePaths(rootDir).some((p) => p.endsWith(`/${active.id}`) || p.endsWith(`\\${active.id}`));
  const phase = await inferPhase(active.dir, rootDir, active.id, hasWorktree);
  if (!phase) process.exit(0);
  const ctx = [
    "[Team Pipeline Recovery]",
    "An active Team pipeline was detected. Re-invoke any /team-* command to continue.",
    "",
    `Phase: ${phase} | Id: ${active.id}`,
    `Artifact directory: docs/plans/${active.id}/`,
    `To continue: re-invoke any /team-* command bare (discovery auto-resolves the directory; an explicit docs/plans/${active.id}/ is still accepted).`,
  ].join("\n");
  process.stderr.write(JSON.stringify({ hookSpecificOutput: { additionalContext: ctx } }) + "\n");
  process.exit(0);
}

main();
