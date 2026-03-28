#!/usr/bin/env node

/**
 * Development-time hook — cross-checks agent frontmatter against registry.json.
 *
 * This is a dev concern (validating the plugin is built correctly), not a
 * runtime concern. It lives in .claude/hooks/, not in the distributed plugin.
 *
 * Triggers on PostToolUse for Write|Edit when the edited file is an agent
 * definition or the registry. Reports mismatches as warnings.
 */

import { readFile, readdir } from "node:fs/promises";
import { resolve, relative, extname, join } from "node:path";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function warn(message) {
  const payload = JSON.stringify({
    hookSpecificOutput: {
      additionalContext: `WARNING: ${message}`,
    },
  });
  process.stderr.write(payload);
}

function parseFrontmatter(content) {
  if (!content.startsWith("---")) return null;
  const endIdx = content.indexOf("\n---", 3);
  if (endIdx === -1) return null;

  const frontmatter = content.slice(4, endIdx);
  const result = { name: null, consumes: null, produces: null };

  for (const line of frontmatter.split("\n")) {
    const nameMatch = line.match(/^name:\s*(.+)/);
    if (nameMatch) result.name = nameMatch[1].trim();

    const consumesMatch = line.match(/^consumes:\s*(.+)/);
    if (consumesMatch) result.consumes = consumesMatch[1].trim();

    const producesMatch = line.match(/^produces:\s*(.+)/);
    if (producesMatch) result.produces = producesMatch[1].trim();
  }

  return result;
}

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

async function crossCheck(projectRoot, editedPath) {
  const registryPath = join(projectRoot, "skills", "team", "registry.json");
  const agentsDir = join(projectRoot, "agents");

  let registry;
  try {
    registry = JSON.parse(await readFile(registryPath, "utf-8"));
  } catch {
    return; // Registry missing or invalid — nothing to check.
  }

  if (!Array.isArray(registry.agents)) return;

  const mismatches = [];
  const registryMap = new Map();

  for (const entry of registry.agents) {
    registryMap.set(entry.name, {
      consumes: normalizeConsumes(entry.consumes),
      produces: entry.produces || "",
    });
  }

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
    if (!fm || !fm.name) continue;

    const registryEntry = registryMap.get(fm.name);

    if (!registryEntry) {
      if (fm.consumes || fm.produces) {
        mismatches.push(
          `${file}: agent "${fm.name}" has event contract in frontmatter but is missing from registry.json`
        );
      }
      continue;
    }

    if (fm.consumes !== null) {
      const fmConsumes = normalizeConsumes(fm.consumes);
      if (fmConsumes !== registryEntry.consumes) {
        mismatches.push(
          `${file}: consumes mismatch — frontmatter="${fm.consumes}" vs registry="${registryEntry.consumes}"`
        );
      }
    }

    if (fm.produces !== null && fm.produces !== registryEntry.produces) {
      mismatches.push(
        `${file}: produces mismatch — frontmatter="${fm.produces}" vs registry="${registryEntry.produces}"`
      );
    }

    registryMap.delete(fm.name);
  }

  for (const [name, entry] of registryMap) {
    mismatches.push(
      `registry.json: agent "${name}" (consumes=${entry.consumes}, produces=${entry.produces}) has no matching agent file`
    );
  }

  if (mismatches.length > 0) {
    warn(
      `Registry/frontmatter sync: ${mismatches.length} mismatch(es) in ${editedPath}:\n${mismatches.join("\n")}`
    );
  }
}

async function main() {
  let input;
  try {
    input = JSON.parse(await readStdin());
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
  const relativePath = relative(projectRoot, resolve(filePath));

  if (relativePath.startsWith("..")) {
    process.exit(0);
  }

  const isAgentEdit =
    relativePath.startsWith("agents/") && extname(relativePath) === ".md";
  const isRegistryEdit = relativePath === "skills/team/registry.json";

  if (isAgentEdit || isRegistryEdit) {
    await crossCheck(projectRoot, relativePath);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
