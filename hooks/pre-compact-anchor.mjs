/** Preserve the explicit recovery command before context compaction. */

import { findLatestTopic, inferPhase } from "../skills/team/scripts/phase-state.mjs";

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

async function main() {
  try {
    const input = await readInput();
    const root = input?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const active = findLatestTopic(root);
    if (!active) return;
    const phase = inferPhase(active.dir);
    if (!phase) return;
    const context = [
      "[Team Pipeline State — Anchor before compaction]",
      `Phase: ${phase} | Id: ${active.id}`,
      `Artifact directory: ${active.dir}`,
      `To continue: /team resume ${active.id}`,
    ].join("\n");
    process.stderr.write(`${JSON.stringify({ hookSpecificOutput: { additionalContext: context } })}\n`);
  } catch {
    // Compaction must continue when recovery inspection fails.
  }
}

await main();
