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

// Parse only, on both runtimes, without ever evaluating the file's top-level
// code — an agent-induced write of `hooks/x.mjs` must not execute in the hook's
// unsandboxed process.
//
// On Node, `node --check` compiles the file and does not run it. On Bun,
// `process.execPath` is `bun`, which has no `--check`, ignores the unknown flag,
// and RUNS the file — so Bun parses through the Transpiler instead, which
// returns only on a successful parse and throws otherwise. A non-zero status, a
// spawn error, or a thrown parse error is a syntax failure; the detail is the
// reason.
function validateHookSyntax(filePath, content, absolutePath, reasons) {
  if (extname(filePath) !== ".mjs") return;
  if (typeof Bun !== "undefined") {
    try {
      new Bun.Transpiler({ loader: "js" }).transformSync(content);
    } catch (err) {
      reasons.push(`Syntax error — ${err.message}`);
    }
    return;
  }
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

  const content = await readFile(absolutePath, "utf-8");
  if (pluginDir === "hooks/") {
    validateHookSyntax(relativePath, content, absolutePath, reasons);
  } else {
    await VALIDATORS[pluginDir](relativePath, content, reasons);
  }
  return reasons;
}
