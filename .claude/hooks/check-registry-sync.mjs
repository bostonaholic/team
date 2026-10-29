#!/usr/bin/env node

// Dev hook: after an agent or registry edit in this repository or one of its
// linked worktrees, runs every agent-config rule through
// .claude/scripts/check-agents.mjs. Exit 2 is the channel Claude Code feeds
// back to the model; an edit in any other repository exits 0 silently.

import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GIT_TIMEOUT_MS = 1000;
const CHECKER_TIMEOUT_MS = 7000;
const REGISTRY_PATH = "skills/team/registry.json";
const AGENT_PATH = /^agents\/[^./][^/]*\.md$/;
const VIOLATION_COUNT = /^check-agents: \d+ violation\(s\)$/;
const RECOVERY =
  "Fix agents/*.md, skills/team/registry.json, and the reviewer table in .claude/scripts/check-agents.mjs together, then rerun: node .claude/scripts/check-agents.mjs";

const PASS = { code: 0, message: "" };
const fault = (message) => ({ code: 2, message: `check-registry-sync: ${message}\n` });

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// Returns { lines } on success, or { exit } when the hook must stop here.
function runGit(dir, args, expectedLines) {
  const run = spawnSync("git", ["-C", dir, ...args], { timeout: GIT_TIMEOUT_MS, encoding: "utf8" });
  if (run.error?.code === "ENOENT") return { exit: PASS };
  if (run.error?.code === "ETIMEDOUT") return { exit: fault(`git did not finish: timeout after ${GIT_TIMEOUT_MS} ms`) };
  if (run.error) throw run.error;
  if (run.signal) return { exit: fault(`git did not finish: ${run.signal}`) };
  if (run.status !== 0) return { exit: PASS };
  const lines = run.stdout.replace(/\n$/, "").split("\n");
  if (lines.length !== expectedLines) return { exit: fault("git gave unexpected output") };
  return { lines };
}

function isCandidatePath(filePath) {
  const agentShaped = basename(dirname(filePath)) === "agents" && filePath.endsWith(".md");
  return agentShaped || filePath.endsWith(REGISTRY_PATH);
}

function sameRealPath(a, b) {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

function runChecker(hookDir, toplevel) {
  const checker = join(hookDir, "..", "scripts", "check-agents.mjs");
  if (!existsSync(checker)) return fault(`check-agents did not run: ${checker} not found`);
  const run = spawnSync(process.execPath, [checker, "--root", toplevel], {
    timeout: CHECKER_TIMEOUT_MS,
    encoding: "utf8",
  });
  if (run.status === 0) return PASS;
  // Node also exits 1 on an uncaught throw, so only the count line marks a real violation report.
  const lastLine = run.stderr.replace(/\n$/, "").split("\n").at(-1);
  if (run.status === 1 && VIOLATION_COUNT.test(lastLine)) {
    return { code: 2, message: `${run.stderr.replace(/\n?$/, "\n")}${RECOVERY}\n` };
  }
  return fault(`check-agents did not run: ${run.error?.code ?? run.signal ?? `exit ${run.status}`}`);
}

async function main() {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    return PASS;
  }

  const toolName = input?.tool_name;
  const filePath = input?.tool_input?.file_path;
  if ((toolName !== "Write" && toolName !== "Edit") || typeof filePath !== "string") return PASS;
  if (!isCandidatePath(filePath)) return PASS;

  let dir;
  try {
    dir = realpathSync(dirname(resolve(filePath)));
  } catch {
    return PASS;
  }
  const edited = runGit(dir, ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"], 2);
  if (edited.exit) return edited.exit;
  const [toplevel, editedCommonDir] = edited.lines;

  const relativePath = relative(toplevel, join(dir, basename(filePath)));
  if (relativePath !== REGISTRY_PATH && !AGENT_PATH.test(relativePath)) return PASS;

  const hookDir = realpathSync(dirname(fileURLToPath(import.meta.url)));
  const own = runGit(hookDir, ["rev-parse", "--path-format=absolute", "--git-common-dir"], 1);
  if (own.exit) return own.exit;
  if (!sameRealPath(editedCommonDir, own.lines[0])) return PASS;

  return runChecker(hookDir, toplevel);
}

main().then(
  ({ code, message }) => {
    process.stderr.write(message);
    process.exitCode = code;
  },
  (error) => {
    process.stderr.write(`check-registry-sync: ${error.message}\n`);
    process.exitCode = 2;
  },
);
