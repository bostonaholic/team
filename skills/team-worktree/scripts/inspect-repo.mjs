#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function git(repo, args, allowFailure = false) {
  try {
    return execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", allowFailure ? "ignore" : "pipe"],
    }).trim();
  } catch (error) {
    if (allowFailure) return "";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error("git " + args.join(" ") + " failed: " + message);
  }
}

function hasRef(repo, ref) {
  try {
    execFileSync("git", ["-C", repo, "show-ref", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
}

function defaultBranch(repo) {
  const remote = git(
    repo,
    ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
    true,
  );
  if (remote.startsWith("origin/")) return remote.slice("origin/".length);
  for (const candidate of ["main", "master"]) {
    if (hasRef(repo, "refs/heads/" + candidate)) return candidate;
  }
  throw new Error("cannot resolve the default branch from origin/HEAD, main, or master");
}

function primaryRoot(repo) {
  const field = git(repo, ["worktree", "list", "--porcelain", "-z"])
    .split("\0")
    .find((value) => value.startsWith("worktree "));
  if (!field) throw new Error("cannot resolve the primary worktree");
  return realpathSync(field.slice("worktree ".length));
}

export function inspectRepo(repo) {
  if (typeof repo !== "string" || !repo.trim()) throw new Error("repo must be a path");
  const absoluteRepo = resolve(repo);
  const gitDir = git(absoluteRepo, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  const commonDir = git(absoluteRepo, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  const branch = git(absoluteRepo, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch === "HEAD") throw new Error("detached HEAD is not a writable feature branch");
  const resolvedDefault = defaultBranch(absoluteRepo);
  const linked = gitDir !== commonDir;
  return {
    repo: absoluteRepo,
    gitDir,
    commonDir,
    primaryRoot: primaryRoot(absoluteRepo),
    branch,
    defaultBranch: resolvedDefault,
    linked,
    onDefaultBranch: branch === resolvedDefault,
  };
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--repo" || !argv[1]) {
    throw new Error("usage: inspect-repo.mjs --repo <path>");
  }
  return argv[1];
}

async function main() {
  try {
    process.stdout.write(JSON.stringify(inspectRepo(parseArgs(process.argv.slice(2)))) + "\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write("inspect-repo: " + message + "\n");
    process.exitCode = 2;
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
