/**
 * SessionStart hook — detects an active TEAM pipeline and prompts recovery.
 *
 * Reads .team/state.json and injects a recovery notice into the session
 * context so the agent knows to suggest /team-resume.
 *
 * Contract: always exits 0. A missing or malformed state file is not an error.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

function projectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

async function readStateFile() {
  const statePath = join(projectDir(), ".team", "state.json");

  try {
    const raw = await readFile(statePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatTestFiles(testFiles) {
  if (!Array.isArray(testFiles) || testFiles.length === 0) {
    return "none";
  }
  return testFiles.join(", ");
}

function formatRecoveryContext(state) {
  const lines = [
    "[TEAM Pipeline Recovery]",
    "An active TEAM pipeline was detected. Resume with /team-resume.",
    "",
    `Phase: ${state.phase} | Topic: ${state.topic}`,
  ];

  if (state.planPath) {
    lines.push(`Plan: ${state.planPath}`);
  }

  if (state.currentStep) {
    lines.push(`Current Step: ${state.currentStep}`);
  }

  const transitions = state.backwardTransitions ?? 0;
  lines.push(`Backward Transitions: ${transitions}/3`);

  if (state.startedAt) {
    lines.push(`Started: ${state.startedAt}`);
  }

  lines.push("");
  lines.push("To resume: run /team-resume");
  lines.push("To abandon: delete .team/state.json");

  return lines.join("\n");
}

async function main() {
  const state = await readStateFile();

  if (!state || !state.phase) {
    process.exit(0);
  }

  const additionalContext = formatRecoveryContext(state);
  const output = JSON.stringify({ hookSpecificOutput: { additionalContext } });

  process.stderr.write(output + "\n");
  process.exit(0);
}

main();
