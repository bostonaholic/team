/** Detect an active Team run and add recovery context. Always exits zero. */

import {
  findActiveTopic,
  inferPhase,
  worktreeMatches,
  worktreePaths,
} from "../skills/artifact-frontmatter/scripts/resolve-topic.mjs";

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

try {
  const input = await readInput();
  const root = input?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const active = await findActiveTopic(root);
  if (active) {
    const phase = await inferPhase(
      active.dir,
      root,
      active.id,
      worktreeMatches(worktreePaths(root), active.id),
    );
    if (phase) {
      const context = [
        "[Team Pipeline Recovery]",
        "An active Team pipeline was detected. Re-invoke /team to continue from the detected phase.",
        "",
        `Phase: ${phase} | Id: ${active.id}`,
        `Artifact directory: ${active.dir}`,
        "To continue: re-invoke /team to resume from the detected phase (it reads the artifacts at the path above).",
      ].join("\n");
      process.stderr.write(
        `${JSON.stringify({ hookSpecificOutput: { additionalContext: context } })}\n`,
      );
    }
  }
} catch {
  // Recovery is advisory. Missing or malformed state must not block startup.
}
