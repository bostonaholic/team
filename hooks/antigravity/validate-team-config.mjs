#!/usr/bin/env node

/**
 * Antigravity CLI PreInvocation hook — warns when `.team/config.json` is invalid.
 *
 * Host: Antigravity CLI. Event: PreInvocation.
 * Sibling of the canonical hooks/validate-team-config.mjs and shares the schema
 * owner (skills/team/references/model-config.mjs). The Codex binding reuses the
 * canonical copy unchanged. The plugin-structure siblings are
 * hooks/post-write-validate.mjs, hooks/codex/post-write-validate.mjs,
 * hooks/codex/session-start-recover.mjs, and hooks/codex/pre-compact-anchor.mjs.
 *
 * Divergences from the canonical copy: Antigravity cannot block a prompt, so
 * this hook never exits nonzero and never writes stderr. An invalid config is
 * reported as a stdout `injectSteps` message and the prompt proceeds. stdin is
 * camelCase with `workspacePaths`, not `cwd`. An absent or valid config prints
 * nothing. A hook bug exits 0.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { CONFIG_DIR, CONFIG_FILE, validateConfig } from "../../skills/team/references/model-config.mjs";

async function readStdinJSON() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf-8")); }
  catch { return {}; }
}

function projectDir(input) {
  const paths = input?.workspacePaths;
  if (Array.isArray(paths) && typeof paths[0] === "string" && paths[0]) return paths[0];
  return null;
}

function inject(configPath, reason) {
  const ephemeralMessage = `[Team config] ${configPath} is invalid: ${reason}. Fix the file before continuing.`;
  process.stdout.write(JSON.stringify({ injectSteps: [{ ephemeralMessage }] }) + "\n");
}

async function main() {
  const input = await readStdinJSON();
  const projectRoot = projectDir(input);
  if (!projectRoot) process.exit(0);

  const configPath = join(projectRoot, CONFIG_DIR, CONFIG_FILE);

  let raw;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch (error) {
    if (error?.code === "ENOENT") process.exit(0);
    inject(configPath, `cannot read the file (${error?.message ?? "unknown error"})`);
    process.exit(0);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (error) {
    inject(configPath, `not valid JSON (${error.message})`);
    process.exit(0);
  }

  try {
    validateConfig(config);
  } catch (error) {
    inject(configPath, error.message);
    process.exit(0);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
