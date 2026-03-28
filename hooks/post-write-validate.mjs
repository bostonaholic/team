#!/usr/bin/env node

/**
 * Claude Code PostToolUse hook — validates plugin structure after edits.
 *
 * Reads JSON from stdin with { tool_name, tool_input: { file_path } }.
 * Checks files in plugin component directories (agents/, skills/, hooks/,
 * .claude-plugin/) against structural expectations.
 * Outputs a warning to stderr on validation failure. Never blocks.
 */

import { readFile } from "node:fs/promises";
import { resolve, relative, extname, basename } from "node:path";
import { pathToFileURL } from "node:url";

const PLUGIN_DIRS = ["agents/", "skills/", "hooks/", ".claude-plugin/"];

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
      additionalContext: `WARNING: Plugin file validation failed for ${filePath}: ${reason}`,
    },
  });
  process.stderr.write(payload);
}

function findPluginDir(relativePath) {
  return PLUGIN_DIRS.find((dir) => relativePath.startsWith(dir));
}

async function validateAgentMarkdown(filePath, content) {
  if (extname(filePath) !== ".md") return;
  if (!content.startsWith("---")) {
    warn(filePath, "Agent .md file must start with YAML frontmatter (---)");
  }
}

async function validateSkillMarkdown(filePath, content) {
  if (basename(filePath) !== "SKILL.md") return;
  if (!content.startsWith("---")) {
    warn(filePath, "SKILL.md must start with YAML frontmatter (---)");
  }
}

async function validatePluginJson(filePath, content) {
  if (extname(filePath) !== ".json") return;
  try {
    JSON.parse(content);
  } catch (err) {
    warn(filePath, `Invalid JSON — ${err.message}`);
  }
}

async function validateHookSyntax(filePath, absolutePath) {
  if (extname(filePath) !== ".mjs") return;
  try {
    // Dynamic import checks syntax without executing side effects at module
    // scope, but we catch only SyntaxError. Any runtime errors from top-level
    // code are ignored — we only care about syntax validity.
    await import(pathToFileURL(absolutePath).href);
  } catch (err) {
    if (err instanceof SyntaxError) {
      warn(filePath, `Syntax error — ${err.message}`);
    }
    // Non-syntax errors (missing env, runtime failures) are expected and
    // irrelevant to structural validation.
  }
}

const VALIDATORS = {
  "agents/": validateAgentMarkdown,
  "skills/": validateSkillMarkdown,
  ".claude-plugin/": validatePluginJson,
  "hooks/": validateHookSyntax,
};

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

  // Paths outside the project or not in a plugin directory — skip.
  if (relativePath.startsWith("..")) {
    process.exit(0);
  }

  const pluginDir = findPluginDir(relativePath);
  if (!pluginDir) {
    process.exit(0);
  }

  const validate = VALIDATORS[pluginDir];

  // For hooks/ syntax checking, we pass the absolute path for dynamic import.
  // For all others, we read the file content.
  if (pluginDir === "hooks/") {
    await validate(relativePath, absolutePath);
  } else {
    let content;
    try {
      content = await readFile(absolutePath, "utf-8");
    } catch (err) {
      warn(relativePath, `Could not read file — ${err.message}`);
      process.exit(0);
    }
    await validate(relativePath, content);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
