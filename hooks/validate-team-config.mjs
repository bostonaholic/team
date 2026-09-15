#!/usr/bin/env node

/**
 * Claude Code UserPromptSubmit hook — validate `.team/config.json` before a
 * prompt reaches the model.
 *
 * The file is optional: absent is valid, and the hook exits 0 silently. A
 * present file that cannot be read, is not valid JSON, or fails the shared
 * schema validation (`skills/team/references/model-config.mjs`, the same owner
 * the resolver uses) blocks the prompt with exit code 2. The stderr text is
 * the blocking message the user sees, so nothing runs against a config the
 * resolver would reject at dispatch time.
 *
 * A hook bug must not strand a session: any unexpected failure exits 0. Only a
 * demonstrated config problem blocks.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { CONFIG_DIR, CONFIG_FILE, validateConfig } from "../skills/team/references/model-config.mjs";

async function readStdinJSON() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf-8")); }
  catch { return {}; }
}

function projectDir(input) {
  return input?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function block(configPath, reason) {
  process.stderr.write(
    [
      `[Team config] ${configPath} is invalid: ${reason}`,
      "Fix the file before continuing — Team refuses to run against an invalid config.",
    ].join("\n") + "\n",
  );
  process.exit(2);
}

async function main() {
  const input = await readStdinJSON();
  const configPath = join(projectDir(input), CONFIG_DIR, CONFIG_FILE);

  let raw;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch (error) {
    if (error?.code === "ENOENT") process.exit(0);
    block(configPath, `cannot read the file (${error?.message ?? "unknown error"})`);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (error) {
    block(configPath, `not valid JSON (${error.message})`);
  }

  try {
    validateConfig(config);
  } catch (error) {
    block(configPath, error.message);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
