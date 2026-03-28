#!/usr/bin/env node

/**
 * Claude Code PostToolUse hook — validates plugin structure after edits.
 *
 * Reads JSON from stdin with { tool_name, tool_input: { file_path } }.
 * Checks files in plugin component directories (agents/, skills/, hooks/,
 * .claude-plugin/) against structural expectations.
 *
 * When an agent file or registry.json is edited, cross-checks that
 * consumes/produces frontmatter stays in sync with the registry.
 *
 * Outputs warnings to stderr on validation failure. Never blocks.
 */

import { readFile, readdir } from "node:fs/promises";
import { resolve, relative, extname, basename, join } from "node:path";
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

/**
 * Parse consumes/produces from YAML frontmatter.
 * Minimal parser — only extracts these two fields, no full YAML dependency.
 */
function parseFrontmatter(content) {
  if (!content.startsWith("---")) return null;
  const endIdx = content.indexOf("\n---", 3);
  if (endIdx === -1) return null;

  const frontmatter = content.slice(4, endIdx);
  const result = { consumes: null, produces: null };

  for (const line of frontmatter.split("\n")) {
    const consumesMatch = line.match(/^consumes:\s*(.+)/);
    if (consumesMatch) {
      result.consumes = consumesMatch[1].trim();
    }
    const producesMatch = line.match(/^produces:\s*(.+)/);
    if (producesMatch) {
      result.produces = producesMatch[1].trim();
    }
  }

  return result;
}

/**
 * Normalize consumes value for comparison.
 * Registry can have string or array; frontmatter is always a string.
 * "a, b, c" and ["a","b","c"] should match.
 */
function normalizeConsumes(value) {
  if (Array.isArray(value)) {
    return value.slice().sort().join(", ");
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .sort()
      .join(", ");
  }
  return "";
}

/**
 * Cross-check agent frontmatter against registry.json.
 * Triggered when either an agent file or the registry is edited.
 */
async function crossCheckContracts(projectRoot, editedPath) {
  const registryPath = join(projectRoot, "skills", "team", "registry.json");
  const agentsDir = join(projectRoot, "agents");

  let registry;
  try {
    const raw = await readFile(registryPath, "utf-8");
    registry = JSON.parse(raw);
  } catch {
    // Registry doesn't exist or is invalid — skip cross-check.
    return;
  }

  if (!Array.isArray(registry.agents)) return;

  const mismatches = [];

  // Build registry lookup: agent name → {consumes, produces}
  const registryMap = new Map();
  for (const entry of registry.agents) {
    registryMap.set(entry.name, {
      consumes: normalizeConsumes(entry.consumes),
      produces: entry.produces || "",
    });
  }

  // Read all agent files
  let agentFiles;
  try {
    agentFiles = await readdir(agentsDir);
  } catch {
    return;
  }

  for (const file of agentFiles) {
    if (extname(file) !== ".md") continue;

    let content;
    try {
      content = await readFile(join(agentsDir, file), "utf-8");
    } catch {
      continue;
    }

    const fm = parseFrontmatter(content);
    if (!fm) continue;

    // Extract agent name from frontmatter
    const nameMatch = content.match(/^name:\s*(.+)/m);
    if (!nameMatch) continue;
    const agentName = nameMatch[1].trim();

    const registryEntry = registryMap.get(agentName);

    if (!registryEntry) {
      // Agent has consumes/produces but is not in registry
      if (fm.consumes || fm.produces) {
        mismatches.push(
          `${file}: agent "${agentName}" has event contract in frontmatter but is missing from registry.json`
        );
      }
      continue;
    }

    // Check consumes
    if (fm.consumes !== null) {
      const fmConsumes = normalizeConsumes(fm.consumes);
      if (fmConsumes !== registryEntry.consumes) {
        mismatches.push(
          `${file}: consumes mismatch — frontmatter="${fm.consumes}" vs registry="${registryEntry.consumes}"`
        );
      }
    }

    // Check produces
    if (fm.produces !== null) {
      if (fm.produces !== registryEntry.produces) {
        mismatches.push(
          `${file}: produces mismatch — frontmatter="${fm.produces}" vs registry="${registryEntry.produces}"`
        );
      }
    }

    // Track that we've checked this registry entry
    registryMap.delete(agentName);
  }

  // Check for registry entries without agent files
  for (const [name, entry] of registryMap) {
    mismatches.push(
      `registry.json: agent "${name}" (consumes=${entry.consumes}, produces=${entry.produces}) has no matching agent file in agents/`
    );
  }

  if (mismatches.length > 0) {
    warn(
      editedPath,
      `Registry/frontmatter sync check found ${mismatches.length} mismatch(es):\n${mismatches.join("\n")}`
    );
  }
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
    await import(pathToFileURL(absolutePath).href);
  } catch (err) {
    if (err instanceof SyntaxError) {
      warn(filePath, `Syntax error — ${err.message}`);
    }
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

  if (relativePath.startsWith("..")) {
    process.exit(0);
  }

  const pluginDir = findPluginDir(relativePath);
  if (!pluginDir) {
    process.exit(0);
  }

  const validate = VALIDATORS[pluginDir];

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

  // Cross-check registry ↔ frontmatter when an agent or registry is edited.
  const isAgentEdit = relativePath.startsWith("agents/") && extname(relativePath) === ".md";
  const isRegistryEdit = relativePath === "skills/team/registry.json";

  if (isAgentEdit || isRegistryEdit) {
    await crossCheckContracts(projectRoot, relativePath);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
