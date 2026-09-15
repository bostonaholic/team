/**
 * Shared plugin-file structural rules.
 *
 * One owner for the checks that Claude, Codex, and OpenCode apply after a write
 * to a plugin component directory. Rules are host-neutral; a caller maps the
 * returned reasons onto its own failure channel (exit code, thrown error, or
 * injected notice). A read failure propagates so each caller can keep its own
 * filesystem-error semantics.
 */

import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { pathToFileURL } from "node:url";

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

// Node reports a parse failure as SyntaxError. Bun reports it as BuildMessage,
// or as ERR_MODULE_NOT_FOUND for the file itself once a sibling in the same
// directory has already loaded. All three mean the file cannot load. The Bun
// branch is gated so Node behavior is unchanged.
function isSyntaxError(err, absolutePath) {
  if (err?.name === "SyntaxError" || err?.name === "BuildMessage") return true;
  if (Array.isArray(err?.errors) && err.errors.some((entry) => isSyntaxError(entry, absolutePath))) return true;
  if (typeof Bun !== "undefined" && err?.code === "ERR_MODULE_NOT_FOUND") {
    const missing = err.message?.match(/Cannot find module '([^']+)'/)?.[1];
    if (!missing) return false;
    try {
      return realpathSync(missing) === realpathSync(absolutePath);
    } catch {
      return missing === absolutePath;
    }
  }
  return false;
}

async function validateHookSyntax(filePath, absolutePath, reasons) {
  if (extname(filePath) !== ".mjs") return;
  try {
    await import(pathToFileURL(absolutePath).href);
  } catch (err) {
    if (isSyntaxError(err, absolutePath)) {
      reasons.push(`Syntax error — ${err.message}`);
    }
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
    await validate(relativePath, absolutePath, reasons);
    return reasons;
  }

  const content = await readFile(absolutePath, "utf-8");
  await validate(relativePath, content, reasons);
  return reasons;
}
