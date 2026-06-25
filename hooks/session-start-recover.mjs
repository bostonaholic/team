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
 * The scan + phase inference is shared with pre-compact-anchor.mjs and lives in
 * ./lib/pipeline-state.mjs; this hook only formats its own notice.
 *
 * Contract: always exits 0. Missing or unparseable artifacts are not an error;
 * every git call is wrapped so git-absent / not-a-repo degrades to a home scan.
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
    "[Team Pipeline Recovery]",
    "An active Team pipeline was detected. Re-invoke /team to continue from the detected phase.",
    "",
    `Phase: ${phase} | Id: ${active.id}`,
    `Artifact directory: ${active.dir}`,
    `To continue: re-invoke /team to resume from the detected phase (it reads the artifacts at the path above).`,
  ].join("\n");
  process.stderr.write(JSON.stringify({ hookSpecificOutput: { additionalContext: ctx } }) + "\n");
  process.exit(0);
}

main();
