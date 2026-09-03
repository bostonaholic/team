#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ID_RE = /^([A-Za-z][A-Za-z0-9_]*-\d+|\d{4}-\d{2}-\d{2})-[a-z0-9][a-z0-9-]*$/;
export const PHASE_FILES = [
  "1-task",
  "2-questions",
  "5-research",
  "6-design",
  "7-structure",
  "8-plan",
];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function readFrontmatter(path) {
  try {
    const lines = (await readFile(path, "utf8")).split("\n", 60);
    if (lines[0] !== "---") return {};
    const fields = {};
    for (let index = 1; index < lines.length && lines[index] !== "---"; index += 1) {
      const match = /^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.+?)\s*$/.exec(lines[index]);
      if (match) fields[match[1]] = match[2];
    }
    return fields;
  } catch {
    return {};
  }
}

export async function designReviewPassed(directory) {
  let names;
  try {
    names = await readdir(directory);
  } catch {
    return false;
  }
  const rounds = names
    .map((name) => /^design-review-(\d+)\.md$/.exec(name))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  if (rounds.length === 0) return false;
  const latest = Math.max(...rounds);
  const verdict = (await readFrontmatter(join(directory, `design-review-${latest}.md`))).verdict;
  return verdict === "APPROVE" || verdict === "COMMENT";
}

async function directoryMtime(directory) {
  let latest = -Infinity;
  for (const phase of PHASE_FILES) {
    try {
      latest = Math.max(latest, (await stat(join(directory, `${phase}.md`))).mtimeMs);
    } catch {
      // Missing phase files do not disqualify a candidate.
    }
  }
  return latest;
}

async function candidates(rootDir, predecessors, requireDesignReview) {
  const plansDir = join(rootDir, "docs", "plans");
  let entries;
  try {
    entries = await readdir(plansDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !ID_RE.test(entry.name)) continue;
    const absolutePath = join(plansDir, entry.name);
    if (!(await Promise.all(predecessors.map((name) => exists(join(absolutePath, name))))).every(Boolean)) {
      continue;
    }
    if (requireDesignReview && !(await designReviewPassed(absolutePath))) continue;
    const mtime = await directoryMtime(absolutePath);
    if (mtime === -Infinity) continue;
    matches.push({
      id: entry.name,
      path: join("docs", "plans", entry.name),
      absolutePath,
      mtime,
    });
  }
  return matches.sort((left, right) => right.mtime - left.mtime || left.id.localeCompare(right.id));
}

export async function resolveTopic({
  rootDir = process.cwd(),
  argument = "",
  predecessors = [],
  requireDesignReview = false,
} = {}) {
  if (argument) {
    const absolutePath = resolve(rootDir, argument);
    try {
      if ((await stat(absolutePath)).isDirectory()) {
        return {
          status: "resolved",
          source: "explicit",
          id: basename(absolutePath),
          path: argument,
          absolutePath,
        };
      }
    } catch {
      // Preserve the public fallback: an invalid explicit path proceeds to discovery.
    }
  }
  const [match] = await candidates(rootDir, predecessors, requireDesignReview);
  if (!match) return { status: "needs-input" };
  return { status: "resolved", source: "discovered", ...match };
}

export function worktreePaths(rootDir) {
  try {
    const output = execFileSync("git", ["-C", rootDir, "worktree", "list", "--porcelain"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length).trim());
  } catch {
    return [];
  }
}

function homeBranch(rootDir, id) {
  try {
    const output = execFileSync("git", ["-C", rootDir, "worktree", "list", "--porcelain"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    let path = null;
    for (const line of output.split("\n")) {
      if (line.startsWith("worktree ")) path = line.slice("worktree ".length).trim();
      if (!line.startsWith("branch ")) continue;
      const branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
      if (path && !path.includes("/.claude/worktrees/") && branch !== id) return branch;
    }
  } catch {
    // Git discovery is optional.
  }
  return null;
}

function defaultBranch(rootDir, id) {
  const resolves = (ref) => {
    try {
      execFileSync("git", ["-C", rootDir, "rev-parse", "--verify", "--quiet", ref], {
        stdio: "ignore",
      });
      return true;
    } catch {
      return false;
    }
  };
  try {
    const symbolic = execFileSync(
      "git",
      ["-C", rootDir, "symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (symbolic) return symbolic.replace(/^refs\/remotes\//, "");
  } catch {
    // Fall through to known refs.
  }
  for (const ref of ["origin/main", "origin/master", "main", "master"]) {
    if (resolves(ref)) return ref;
  }
  const home = homeBranch(rootDir, id);
  if (home && resolves(home)) return home;
  try {
    const configured = execFileSync("git", ["-C", rootDir, "config", "--get", "init.defaultBranch"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (configured && resolves(configured)) return configured;
  } catch {
    // No usable default branch.
  }
  return null;
}

function hasImplementationCommit(rootDir, id) {
  try {
    const baseBranch = defaultBranch(rootDir, id);
    if (!baseBranch) return false;
    const mergeBase = execFileSync("git", ["-C", rootDir, "merge-base", baseBranch, id], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!mergeBase) return false;
    return Boolean(
      execFileSync("git", ["-C", rootDir, "log", "--oneline", `${mergeBase}..${id}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch {
    return false;
  }
}

export function worktreeMatches(paths, id) {
  return paths.some((path) => path.endsWith(`/${id}`) || path.endsWith(`\\${id}`));
}

export async function findActiveTopic(rootDir) {
  const paths = worktreePaths(rootDir);
  const roots = [rootDir, ...paths.filter((path) => path !== rootDir)];
  const found = new Map();
  for (const root of roots) {
    const plansDir = join(root, "docs", "plans");
    let entries;
    try {
      entries = await readdir(plansDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !ID_RE.test(entry.name)) continue;
      const directory = join(plansDir, entry.name);
      let mtime = await directoryMtime(directory);
      if (mtime === -Infinity && worktreeMatches(paths, entry.name)) {
        try {
          mtime = (await stat(directory)).mtimeMs;
        } catch {
          // Ignore an unreadable directory.
        }
      }
      if (mtime === -Infinity) continue;
      const previous = found.get(entry.name);
      if (!previous || mtime > previous.mtime) {
        found.set(entry.name, { id: entry.name, dir: directory, mtime });
      }
    }
  }
  return [...found.values()].sort(
    (left, right) => right.mtime - left.mtime || left.id.localeCompare(right.id),
  )[0] ?? null;
}

export async function inferPhase(directory, rootDir, id, hasWorktree) {
  const has = (name) => exists(join(directory, `${name}.md`));
  if (hasWorktree && !(await has("1-task"))) return "WORKTREE";
  if ((await has("8-plan")) && hasImplementationCommit(rootDir, id)) return "IMPLEMENT";
  if (await has("7-structure")) return "PLAN";
  if (await has("6-design")) return (await designReviewPassed(directory)) ? "STRUCTURE" : "DESIGN";
  if (await has("5-research")) return "DESIGN";
  if ((await has("2-questions")) || (await has("1-task"))) return "RESEARCH";
  return null;
}

function parseArgs(argv) {
  const options = {
    rootDir: process.cwd(),
    argument: "",
    predecessors: [],
    requireDesignReview: false,
  };
  let argumentFromStdin = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--require-design-review") options.requireDesignReview = true;
    else if (argument === "--argument-stdin") {
      if (argumentFromStdin) throw new Error("--argument-stdin may appear once");
      argumentFromStdin = true;
      options.argument = readFileSync(0, "utf8");
    } else if (["--root", "--predecessor"].includes(argument)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      if (argument === "--root") options.rootDir = resolve(value);
      else options.predecessors.push(value);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

async function main() {
  try {
    process.stdout.write(`${JSON.stringify(await resolveTopic(parseArgs(process.argv.slice(2))))}\n`);
  } catch (error) {
    process.stderr.write(`resolve-topic: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
