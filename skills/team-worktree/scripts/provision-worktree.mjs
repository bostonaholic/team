#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

function git(repo, args, input) {
  const result = spawnSync("git", ["-C", repo, ...args], {
    input,
    encoding: "utf8",
    stdio: [input == null ? "ignore" : "pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args[0]} failed`);
  }
  return result.stdout;
}

function gitRoot(path, label) {
  if (typeof path !== "string" || !isAbsolute(path)) {
    throw new Error(`${label} must be an absolute path`);
  }
  const actual = realpathSync(path);
  const root = realpathSync(git(actual, ["rev-parse", "--show-toplevel"]).trim());
  if (actual !== root) throw new Error(`${label} must be a repository root`);
  return root;
}

function commonDir(root) {
  return realpathSync(
    git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim(),
  );
}

function nulPaths(value) {
  return value.split("\0").filter(Boolean);
}

function safePath(root, path) {
  if (!path || isAbsolute(path) || path.split(/[\\/]/).includes("..")) {
    throw new Error(`unsafe .worktreeinclude match: ${JSON.stringify(path)}`);
  }
  const absolute = resolve(root, path);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
    throw new Error(`unsafe .worktreeinclude match: ${JSON.stringify(path)}`);
  }
  return absolute;
}

function assertNoDestinationSymlink(root, destination) {
  let current = root;
  for (const part of relative(root, destination).split(sep)) {
    current = join(current, part);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") return;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`unsafe destination symlink: ${current}`);
    }
  }
}

export function provisionWorktree(repoPath, worktreePath) {
  const repo = gitRoot(repoPath, "repo");
  const worktree = gitRoot(worktreePath, "worktree");
  if (commonDir(repo) !== commonDir(worktree)) {
    throw new Error("worktree does not belong to repo");
  }

  const include = resolve(repo, ".worktreeinclude");
  if (!existsSync(include)) return [];

  const candidates = nulPaths(git(repo, [
    "ls-files",
    "--others",
    "--ignored",
    "-z",
    `--exclude-from=${include}`,
  ])).map((path) => {
    safePath(repo, path);
    return path;
  });
  if (candidates.length === 0) return [];

  const ignoredResult = spawnSync(
    "git",
    ["-C", repo, "check-ignore", "--no-index", "-z", "--stdin"],
    { input: `${candidates.join("\0")}\0`, encoding: "utf8" },
  );
  if (ignoredResult.status !== 0 && ignoredResult.status !== 1) {
    throw new Error(ignoredResult.stderr.trim() || "git check-ignore failed");
  }

  const copied = [...new Set(nulPaths(ignoredResult.stdout))].sort();
  const worktreesRoot = resolve(repo, ".claude", "worktrees");
  const eligible = copied.filter((path) => {
    const source = safePath(repo, path);
    return source !== worktreesRoot && !source.startsWith(`${worktreesRoot}${sep}`);
  });
  const provisioned = [];
  for (const path of eligible) {
    const source = safePath(repo, path);
    const destination = safePath(worktree, path);
    assertNoDestinationSymlink(worktree, destination);
    if (existsSync(destination)) continue;
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, {
      recursive: true,
      preserveTimestamps: true,
      verbatimSymlinks: true,
    });
    provisioned.push(path);
  }
  return provisioned;
}

function main() {
  try {
    const [repo, worktree, ...extra] = process.argv.slice(2);
    if (!repo || !worktree || extra.length > 0) {
      throw new Error("usage: provision-worktree.mjs <repo-root> <worktree-root>");
    }
    process.stdout.write(`${JSON.stringify(provisionWorktree(repo, worktree))}\n`);
  } catch (error) {
    process.stderr.write(
      `provision-worktree: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
