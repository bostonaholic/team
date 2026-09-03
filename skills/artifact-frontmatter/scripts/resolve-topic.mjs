#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ID_RE =
  /^(?:[A-Za-z][A-Za-z0-9_]*-\d+|\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const DISCOVERY_FILES = ["1-task.md", "2-questions.md", "5-research.md", "6-design.md", "7-structure.md", "8-plan.md"];

export function isTopicId(value) {
  return ID_RE.test(value);
}

function git(rootDir, args) {
  return execFileSync("git", ["-C", rootDir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

export function worktrees(rootDir) {
  let output;
  try {
    output = git(rootDir, ["worktree", "list", "--porcelain"]);
  } catch {
    return [];
  }

  const records = [];
  let current = null;
  for (const line of `${output}\n`.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) records.push(current);
      current = { path: line.slice(9).trim(), branch: null };
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice(7).trim().replace(/^refs\/heads\//, "");
    } else if (current && line === "") {
      records.push(current);
      current = null;
    }
  }
  return records;
}

export function artifactRoots(rootDir) {
  return [...new Set([resolve(rootDir), ...worktrees(rootDir).map((entry) => resolve(entry.path))])];
}

function directoryExists(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function resolveArtifactDirectory(rootDir, id) {
  if (!isTopicId(id)) return null;
  const records = new Map(worktrees(rootDir).map((entry) => [resolve(entry.path), entry]));
  const candidates = artifactRoots(rootDir)
    .map((root) => ({ root, dir: join(root, "docs", "plans", id), record: records.get(root) }))
    .filter(({ dir }) => directoryExists(dir))
    .sort((left, right) => {
      const score = ({ root, record }) =>
        record?.branch === id ? 3 : basename(root) === id ? 2 : root === resolve(rootDir) ? 1 : 0;
      return score(right) - score(left) || left.dir.localeCompare(right.dir);
    });
  return candidates[0]?.dir ?? null;
}

function fileExists(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function artifactMtime(dir) {
  let modified = -Infinity;
  for (const name of DISCOVERY_FILES) {
    try {
      modified = Math.max(modified, statSync(join(dir, name)).mtimeMs);
    } catch {
      // Missing phase files do not disqualify a candidate.
    }
  }
  return modified;
}

export function discoverArtifactDirectory(rootDir, rawArgument, predecessor) {
  if (typeof rawArgument !== "string") throw new Error("argument must be text");
  if (typeof predecessor !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(predecessor)) {
    throw new Error("predecessor must be one filename");
  }

  const argument = rawArgument.trim();
  if (argument) {
    const dir = resolve(rootDir, argument);
    if (directoryExists(dir)) {
      return { status: "resolved", source: "explicit", id: basename(dir), dir };
    }
  }

  const ids = new Set();
  for (const root of artifactRoots(rootDir)) {
    try {
      for (const entry of readdirSync(join(root, "docs", "plans"), { withFileTypes: true })) {
        if (entry.isDirectory() && isTopicId(entry.name)) ids.add(entry.name);
      }
    } catch {
      // A checkout without docs/plans contributes no candidates.
    }
  }
  const candidates = [...ids]
    .map((id) => ({ id, dir: resolveArtifactDirectory(rootDir, id) }))
    .filter((entry) => entry.dir && fileExists(join(entry.dir, predecessor)))
    .map((entry) => ({ ...entry, modified: artifactMtime(entry.dir) }))
    .sort((left, right) => right.modified - left.modified || right.id.localeCompare(left.id));
  const selected = candidates[0];
  return selected
    ? { status: "resolved", source: "newest", id: selected.id, dir: selected.dir }
    : { status: "needs-input", reason: "no-candidate" };
}

export function readFrontmatter(path) {
  try {
    const lines = readFileSync(path, "utf8").split("\n", 60);
    if (lines[0] !== "---") return {};
    const fields = {};
    let closed = false;
    for (let index = 1; index < lines.length; index += 1) {
      if (lines[index] === "---") {
        closed = true;
        break;
      }
      const match = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*?)\s*$/.exec(lines[index]);
      if (!match || Object.hasOwn(fields, match[1])) return {};
      fields[match[1]] = match[2];
    }
    return closed ? fields : {};
  } catch {
    return {};
  }
}

function main() {
  if (process.argv[2] === "discover") {
    const [rootDir, predecessor, ...extra] = process.argv.slice(3);
    if (!rootDir || !predecessor || extra.length > 0) {
      process.stderr.write("Usage: resolve-topic.mjs discover <repo-root> <predecessor>\n");
      process.exitCode = 2;
      return;
    }
    try {
      const result = discoverArtifactDirectory(rootDir, readFileSync(0, "utf8"), predecessor);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
    }
    return;
  }
  const [rootDir, id, ...extra] = process.argv.slice(2);
  if (!rootDir || !id || extra.length > 0 || !isTopicId(id)) {
    process.stderr.write("Usage: resolve-topic.mjs <repo-root> <id>\n");
    process.exitCode = 2;
    return;
  }
  const dir = resolveArtifactDirectory(rootDir, id);
  if (!dir) {
    process.stderr.write(`No artifact directory for ${id}\n`);
    process.exitCode = 3;
    return;
  }
  process.stdout.write(`${JSON.stringify({ id, dir })}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
