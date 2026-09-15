#!/usr/bin/env node

/**
 * Codex CLI PostToolUse hook — validates plugin structure after an apply_patch.
 *
 * Host: Codex CLI. Event: PostToolUse, matcher `apply_patch`.
 * Sibling of the canonical hooks/post-write-validate.mjs and shares its rules
 * (hooks/lib/validate-plugin-file.mjs). The other copies are
 * hooks/codex/session-start-recover.mjs, hooks/codex/pre-compact-anchor.mjs,
 * and hooks/antigravity/validate-team-config.mjs (the last guards the model
 * config, not plugin structure).
 *
 * Divergences from the canonical copy: the Codex event carries patch text under
 * `tool_input`, not a `file_path`, so this hook parses the `*** Add File:` and
 * `*** Update File:` headers itself. Codex blocks with exit 2 and a plain-text
 * stderr reason; the canonical copy blocks with exit 1 and a JSON
 * `hookSpecificOutput` payload on stderr. This hook writes nothing to stdout.
 *
 * An added file that is not on disk is validated from the patch body staged in
 * a temp directory, so the shared rules still own the check. A path outside the
 * project or outside the plugin component directories is left alone. A hook bug
 * exits 0 rather than block a patch it cannot judge.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

import { PLUGIN_DIRS, validatePluginFile } from "../lib/validate-plugin-file.mjs";

const FILE_HEADER = /^\*\*\* (Add|Update) File: (.+?)\s*$/;

async function readStdinJSON() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf-8")); }
  catch { return {}; }
}

// Codex delivers the apply_patch argument as the tool input. The observed shape
// is an object whose `input` field holds the patch text; a bare string and the
// `patch` key are handled because the exact key is not pinned by the host.
function patchText(toolInput) {
  if (typeof toolInput === "string") return toolInput;
  if (toolInput && typeof toolInput === "object") {
    for (const key of ["input", "patch", "content", "text"]) {
      if (typeof toolInput[key] === "string") return toolInput[key];
    }
  }
  return null;
}

function parsePatch(text) {
  const files = [];
  let current = null;
  for (const line of text.split("\n")) {
    const header = line.match(FILE_HEADER);
    if (header) {
      current = { kind: header[1], path: header[2], added: [] };
      files.push(current);
      continue;
    }
    if (line.startsWith("*** ")) {
      current = null;
      continue;
    }
    if (current && current.kind === "Add" && line.startsWith("+")) {
      current.added.push(line.slice(1));
    }
  }
  return files;
}

// Repo-relative path when it lands in a plugin component directory, else null.
function pluginRelativePath(filePath, projectRoot) {
  const relativePath = relative(projectRoot, resolve(projectRoot, filePath));
  if (!relativePath || relativePath.startsWith("..")) return null;
  return PLUGIN_DIRS.some((dir) => relativePath.startsWith(dir)) ? relativePath : null;
}

// An ADDED file is not on disk yet, so its patch body is always staged to a
// temp dir and validated against the staged path. Validating the project path
// would run the shared rules against a file that does not exist, which can
// either swallow the failure or report a misleading reason. Update/other kinds
// read the file that is already on disk.
async function collectReasons(file, relativePath, projectRoot, stagingRoot) {
  if (file.kind === "Add") {
    const stagedPath = join(stagingRoot, relativePath);
    await mkdir(dirname(stagedPath), { recursive: true });
    await writeFile(stagedPath, `${file.added.join("\n")}\n`);
    return await validatePluginFile(relativePath, stagedPath);
  }
  return await validatePluginFile(relativePath, resolve(projectRoot, relativePath));
}

function block(relativePath, reason) {
  process.stderr.write(
    `BLOCKED: Plugin file validation failed for ${relativePath}: ${reason}. Fix the issue before proceeding.\n`,
  );
}

async function main() {
  const input = await readStdinJSON();
  const text = patchText(input?.tool_input);
  if (!text) process.exit(0);

  const files = parsePatch(text);
  if (files.length === 0) process.exit(0);

  const projectRoot = input?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const stagingRoot = await mkdtemp(join(tmpdir(), "team-codex-validate-"));
  let blocker = null;
  try {
    for (const file of files) {
      const relativePath = pluginRelativePath(file.path, projectRoot);
      if (!relativePath) continue;
      const reasons = await collectReasons(file, relativePath, projectRoot, stagingRoot);
      if (reasons.length > 0) {
        blocker = { relativePath, reasons };
        break;
      }
    }
  } finally {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
  }

  if (blocker) {
    for (const reason of blocker.reasons) block(blocker.relativePath, reason);
    process.exit(2);
  }
  process.exit(0);
}

main().catch(() => process.exit(0));
