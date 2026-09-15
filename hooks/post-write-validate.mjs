#!/usr/bin/env node

/**
 * Claude Code PostToolUse hook — validates plugin structure after edits.
 *
 * Reads JSON from stdin with { tool_name, tool_input: { file_path } }.
 * Checks files in plugin component directories (agents/, skills/, hooks/,
 * .claude-plugin/) against structural expectations.
 *
 * Blocks on validation failure (exit 1) to enforce structural quality.
 */

import { relative, resolve } from "node:path";
import { validatePluginFile } from "./lib/validate-plugin-file.mjs";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function warn(filePath, reason) {
  const payload = JSON.stringify({
    hookSpecificOutput: {
      additionalContext: `BLOCKED: Plugin file validation failed for ${filePath}: ${reason}. Fix the issue before proceeding.`,
    },
  });
  process.stderr.write(payload);
}

async function main() {
  let input;
  try {
    const raw = await readStdin();
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const toolName = input?.tool_name;
  if (toolName !== "Write" && toolName !== "Edit") {
    process.exit(0);
  }

  const filePath = input?.tool_input?.file_path;
  if (typeof filePath !== "string") {
    process.exit(0);
  }

  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const absolutePath = resolve(filePath);
  const relativePath = relative(projectRoot, absolutePath);

  if (relativePath.startsWith("..")) {
    process.exit(0);
  }

  let reasons;
  try {
    reasons = await validatePluginFile(relativePath, absolutePath);
  } catch (err) {
    warn(relativePath, `Could not read file — ${err.message}`);
    process.exit(0);
  }

  for (const reason of reasons) {
    warn(relativePath, reason);
  }

  process.exit(reasons.length > 0 ? 1 : 0);
}

main().catch(() => process.exit(0));
