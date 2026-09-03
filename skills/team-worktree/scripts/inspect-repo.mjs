#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
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
  const match = git(repo, ["worktree", "list", "--porcelain"]).match(/^worktree (.+)$/m);
  if (!match) throw new Error("cannot resolve the primary worktree");
  return realpathSync(match[1]);
}

function isPrimaryArtifactDirectory(primary, artifactDir) {
  if (artifactDir == null) return false;
  if (typeof artifactDir !== "string" || !isAbsolute(artifactDir)) {
    throw new Error("artifact directory must be an absolute path");
  }
  const planned = resolve(artifactDir);
  let actual;
  try {
    if (!statSync(planned).isDirectory()) return false;
    actual = realpathSync(planned);
  } catch {
    return false;
  }
  const parts = relative(primary, actual).split(sep);
  return parts.length === 3 && parts[0] === "docs" && parts[1] === "plans" && Boolean(parts[2]);
}

export function inspectRepo(repo, artifactDir = null) {
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
  const primary = primaryRoot(absoluteRepo);
  return {
    repo: absoluteRepo,
    gitDir,
    commonDir,
    primaryRoot: primary,
    branch,
    defaultBranch: resolvedDefault,
    linked,
    onDefaultBranch: branch === resolvedDefault,
    preserveArtifactHome: isPrimaryArtifactDirectory(primary, artifactDir),
  };
}

function parseArgs(argv) {
  if (
    argv.length !== 4 ||
    argv[0] !== "--repo" ||
    !argv[1] ||
    argv[2] !== "--artifact-dir" ||
    !argv[3]
  ) {
    throw new Error("usage: inspect-repo.mjs --repo <path> --artifact-dir <path>");
  }
  return { repo: argv[1], artifactDir: argv[3] };
}

async function main() {
  try {
    const { repo, artifactDir } = parseArgs(process.argv.slice(2));
    process.stdout.write(JSON.stringify(inspectRepo(repo, artifactDir)) + "\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write("inspect-repo: " + message + "\n");
    process.exitCode = 2;
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
