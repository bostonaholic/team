#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { isTopicId } from "../../artifact-frontmatter/scripts/resolve-topic.mjs";

const PHASES = new Set([
  "worktree",
  "question",
  "research",
  "design",
  "structure",
  "plan",
  "implement",
  "pr",
]);

export function parseTeamInput(raw) {
  const input = raw.trim();
  if (!input) throw new Error("A ticket, URL, description, or resume command is required");

  const tokens = input.split(/\s+/);
  if (tokens[0] !== "resume") {
    if (tokens.includes("--only")) throw new Error("--only requires: resume <id> --only <phase>");
    return { mode: "start", request: input };
  }

  const [, id, flag, phase, ...extra] = tokens;
  if (!id || !isTopicId(id)) throw new Error(`Invalid topic id: ${id ?? ""}`);
  if (extra.length > 0 || (flag !== undefined && flag !== "--only") || (flag && !phase)) {
    throw new Error("Usage: resume <id> [--only <phase>]");
  }
  if (phase && !PHASES.has(phase)) throw new Error(`Invalid phase: ${phase}`);
  return { mode: "resume", id, only: phase ?? null };
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try {
    process.stdout.write(`${JSON.stringify(parseTeamInput(Buffer.concat(chunks).toString("utf8")))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
