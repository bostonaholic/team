#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function findWorktree(input, branch) {
  if (typeof branch !== "string" || !branch) throw new Error("branch is required");

  let candidate = "";
  for (const field of input.split("\0")) {
    if (!field) {
      candidate = "";
    } else if (field.startsWith("worktree ")) {
      candidate = field.slice("worktree ".length);
    } else if (field === `branch refs/heads/${branch}`) {
      return candidate;
    }
  }
  return "";
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--branch" || !argv[1]) {
    throw new Error("usage: find-worktree.mjs --branch <branch>");
  }
  return argv[1];
}

async function main() {
  try {
    const branch = parseArgs(process.argv.slice(2));
    const input = readFileSync(0, "utf8");
    process.stdout.write(findWorktree(input, branch));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`find-worktree: ${message}\n`);
    process.exitCode = 2;
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
