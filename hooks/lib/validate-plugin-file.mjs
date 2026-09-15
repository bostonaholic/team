/**
 * Shared plugin-file structural rules.
 *
 * One owner for the checks that Claude, Codex, and OpenCode apply after a write
 * to a plugin component directory. Rules are host-neutral; a caller maps the
 * returned reasons onto its own failure channel (exit code, thrown error, or
 * injected notice). A read failure propagates so each caller can keep its own
 * filesystem-error semantics.
 */

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

export const PLUGIN_DIRS = ["agents/", "skills/", "hooks/", ".claude-plugin/"];

function findPluginDir(relativePath) {
  return PLUGIN_DIRS.find((dir) => relativePath.startsWith(dir));
}

function validateAgentMarkdown(filePath, content, reasons) {
  if (extname(filePath) !== ".md") return;
  if (!content.startsWith("---")) {
    reasons.push("Agent .md file must start with YAML frontmatter (---)");
  }
}

function validateSkillMarkdown(filePath, content, reasons) {
  if (basename(filePath) !== "SKILL.md") return;
  if (!content.startsWith("---")) {
    reasons.push("SKILL.md must start with YAML frontmatter (---)");
  }
}

function validatePluginJson(filePath, content, reasons) {
  if (extname(filePath) !== ".json") return;
  try {
    JSON.parse(content);
  } catch (err) {
    reasons.push(`Invalid JSON — ${err.message}`);
  }
}

// Parse only. `node --check` compiles the file without evaluating its top-level
// code, so an agent-induced write of `hooks/x.mjs` cannot execute in the hook's
// unsandboxed process. A non-zero status or a spawn error is a syntax failure;
// the compiler's stderr is the reason.
function validateHookSyntax(filePath, absolutePath, reasons) {
  if (extname(filePath) !== ".mjs") return;
  const result = spawnSync(process.execPath, ["--check", absolutePath], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  if (result.error) {
    reasons.push(`Syntax error — ${result.error.message}`);
    return;
  }
  if (result.status !== 0) {
    const detail = result.stderr?.toString().trim() || "node --check failed";
    reasons.push(`Syntax error — ${detail}`);
  }
}

const VALIDATORS = {
  "agents/": validateAgentMarkdown,
  "skills/": validateSkillMarkdown,
  ".claude-plugin/": validatePluginJson,
  "hooks/": validateHookSyntax,
};

export async function validatePluginFile(relativePath, absolutePath) {
  const reasons = [];
  const pluginDir = findPluginDir(relativePath);
  if (!pluginDir) return reasons;

  const validate = VALIDATORS[pluginDir];
  if (pluginDir === "hooks/") {
    validate(relativePath, absolutePath, reasons);
    return reasons;
  }

  const content = await readFile(absolutePath, "utf-8");
  await validate(relativePath, content, reasons);
  return reasons;
}
