#!/usr/bin/env node

/**
 * Development-time hook — cross-checks the agent inventory against registry.json.
 *
 * This is a dev concern (validating the plugin is built correctly), not a
 * runtime concern. It lives in .claude/hooks/, not in the distributed plugin.
 *
 * Triggers on PostToolUse for Write|Edit when the edited file is an agent
 * definition or the registry. Validates that:
 *   - every agents/<name>.md has a matching agents[*].name in registry.json
 *   - every registry.agents[*].name has a matching agents/<name>.md file
 *
 * `phase` lives only in registry.json (not in agent frontmatter — Claude
 * Code's supported agent frontmatter does not include custom fields).
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
  const result = { name: null };

  for (const line of frontmatter.split("\n")) {
    const nameMatch = line.match(/^name:\s*(.+)/);
    if (nameMatch) result.name = nameMatch[1].trim();
  }

  return result;
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
  const registryNames = new Set(registry.agents.map((a) => a.name));

  let agentFiles;
  try {
    agentFiles = await readdir(agentsDir);
  } catch {
    return;
  }

  const agentFileNames = new Set();

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

    agentFileNames.add(fm.name);

    if (!registryNames.has(fm.name)) {
      mismatches.push(
        `${file}: agent "${fm.name}" missing from registry.json`
      );
    }
  }

  for (const name of registryNames) {
    if (!agentFileNames.has(name)) {
      mismatches.push(
        `registry.json: agent "${name}" has no matching agents/${name}.md file`
      );
    }
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
