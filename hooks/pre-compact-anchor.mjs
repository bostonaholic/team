/**
 * PreCompact hook — anchors Team pipeline state before compaction.
 * Scans the home docs/plans/<id>/ subdirectories plus every git worktree's
 * docs/plans/<id>/ for the most recent active topic, infers the current phase
 * from artifact presence + git signals (a leading WORKTREE state when a
 * worktree exists with no task.md yet; IMPLEMENT once >=1 commit lands on the
 * <id> branch since the default-branch merge-base), and injects a 4-line
 * anchor into additionalContext. The anchor tells the agent to re-invoke
 * /team to resume from the detected phase. Stateless; always exits 0. Every
 * git call is wrapped so git-absent / not-a-repo degrades to a home scan.
 *
 * The scan + phase inference is shared with session-start-recover.mjs and lives
 * in ./lib/pipeline-state.mjs; this hook only formats its own anchor.
 */

import {
  findActiveTopic,
  inferPhase,
  projectDir,
  readStdinJSON,
  worktreeMatches,
  worktreePaths,
} from "./lib/pipeline-state.mjs";

async function main() {
  const input = await readStdinJSON();
  const rootDir = projectDir(input);
  const active = await findActiveTopic(rootDir);
  if (!active) process.exit(0);
  const hasWorktree = worktreeMatches(worktreePaths(rootDir), active.id);
  const phase = await inferPhase(active.dir, rootDir, active.id, hasWorktree);
  if (!phase) process.exit(0);
  const ctx = [
    "[Team Pipeline State — Anchor before compaction]",
    `Phase: ${phase} | Id: ${active.id}`,
    `Artifact directory: ${active.dir}`,
    `To continue: re-invoke /team to resume from the detected phase (it reads the artifacts at the path above).`,
  ].join("\n");
  process.stderr.write(JSON.stringify({ hookSpecificOutput: { additionalContext: ctx } }) + "\n");
  process.exit(0);
}

main();
