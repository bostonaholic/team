#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  artifactRoots,
  ID_RE,
  isTopicId,
  readFrontmatter,
  resolveArtifactDirectory,
  worktrees,
} from "../../artifact-frontmatter/scripts/resolve-topic.mjs";

export { ID_RE, isTopicId, readFrontmatter, resolveArtifactDirectory, worktrees };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const PHASES = [
  "WORKTREE",
  "QUESTION",
  "RESEARCH",
  "DESIGN",
  "STRUCTURE",
  "PLAN",
  "IMPLEMENT",
  "PR",
];

const PHASE_FILES = [
  "1-task.md",
  "2-questions.md",
  "5-research.md",
  "6-design.md",
  "7-structure.md",
  "8-plan.md",
  "9-implementation.md",
  "10-pr.md",
];

function git(rootDir, args) {
  return execFileSync("git", ["-C", rootDir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function directoryExists(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isArtifactDirectory(path) {
  if (!isAbsolute(path) || !isTopicId(basename(path))) return false;
  const plans = dirname(path);
  return basename(plans) === "plans" && basename(dirname(plans)) === "docs";
}

function topicFor(dir) {
  const match = ID_RE.exec(basename(resolve(dir)));
  const topic = readFrontmatter(join(dir, "1-task.md")).topic;
  return match && topic === match[1] ? topic : null;
}

function commonFieldsMatch(frontmatter, topic, phase) {
  return Boolean(
    topic &&
      frontmatter.topic === topic &&
      frontmatter.phase === phase &&
      DATE_RE.test(frontmatter.date ?? ""),
  );
}

function sectionHasContent(path, heading) {
  let lines;
  try {
    lines = readFileSync(path, "utf8").split("\n");
  } catch {
    return false;
  }
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return false;
  const end = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).some((line) => line.trim() !== "");
}

function taskRecorded(dir, topic = topicFor(dir)) {
  const frontmatter = readFrontmatter(join(dir, "1-task.md"));
  return Boolean(
    commonFieldsMatch(frontmatter, topic, "task") &&
      Object.hasOwn(frontmatter, "ticketId") &&
      (frontmatter.workflow === undefined || frontmatter.workflow === "team") &&
      sectionHasContent(join(dir, "1-task.md"), "## Request"),
  );
}

function isTeamRun(dir) {
  const workflow = readFrontmatter(join(dir, "1-task.md")).workflow;
  return workflow === undefined || workflow === "team";
}

export function designReviewPassed(dir, topic = topicFor(dir)) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return false;
  }
  const latest = names
    .map((name) => ({ name, match: /^design-review-(\d+)\.md$/.exec(name) }))
    .filter(({ match }) => match)
    .sort((a, b) => Number(b.match[1]) - Number(a.match[1]))[0];
  if (!latest) return false;
  const frontmatter = readFrontmatter(join(dir, latest.name));
  if (!commonFieldsMatch(frontmatter, topic, "design-review")) return false;
  const verdict = frontmatter.verdict;
  return verdict === "APPROVE" || verdict === "COMMENT";
}

function sectionEntries(path, heading, valuePattern) {
  let lines;
  try {
    lines = readFileSync(path, "utf8").split("\n");
  } catch {
    return new Map();
  }
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return new Map();
  const entries = new Map();
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const match = /^-\s+([A-Za-z0-9_-]+):\s+(.+?)\s*$/.exec(line);
    if (match && valuePattern.test(match[2])) entries.set(match[1], match[2]);
  }
  return entries;
}

function strictSectionEntries(path, heading, valuePattern) {
  let lines;
  try {
    lines = readFileSync(path, "utf8").split("\n");
  } catch {
    return null;
  }
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return null;
  const entries = new Map();
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    if (!line.trim()) continue;
    const match = /^-\s+([A-Za-z0-9._-]+):\s+(.+?)\s*$/.exec(line);
    if (!match || entries.has(match[1]) || !valuePattern.test(match[2])) return null;
    entries.set(match[1], match[2]);
  }
  return entries;
}

function additionalRepos(path) {
  let lines;
  try {
    lines = readFileSync(path, "utf8").split("\n");
  } catch {
    return null;
  }
  const start = lines.findIndex((line) => line.trim() === "## Additional repos");
  if (start < 0) return null;
  const records = [];
  let current = null;
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const name = /^-\s+\*\*name:\*\*\s+([A-Za-z0-9._-]+)\s*$/.exec(line);
    if (name) {
      if (current && current.path === null) return null;
      current = { name: name[1], path: null };
      records.push(current);
      continue;
    }
    const repoPath = /^\s+\*\*path:\*\*\s+(.+?)\s*$/.exec(line);
    if (repoPath) {
      if (!current || current.path !== null || !isAbsolute(repoPath[1])) return null;
      current.path = repoPath[1];
      continue;
    }
    if (/^-\s+/.test(line)) return null;
  }
  if (records.length === 0 || records.some((record) => record.path === null)) return null;
  const names = records.map(({ name }) => name);
  const paths = records.map(({ path }) => path);
  if (
    names.includes("home") ||
    new Set(names).size !== names.length ||
    new Set(paths).size !== paths.length
  ) return null;
  return new Map(records.map(({ name, path }) => [name, path]));
}

export function worktreeMap(dir) {
  const repos = join(dir, "4-repos.md");
  if (existsSync(repos)) {
    if (!commonFieldsMatch(readFrontmatter(repos), topicFor(dir), "repos")) return new Map();
    const declared = additionalRepos(repos);
    const entries = strictSectionEntries(repos, "## Worktrees", /\S/);
    if (!declared || !entries) return new Map();
    const paths = [...entries.values()];
    const required = new Set(["home", ...declared.keys()]);
    if (
      entries.size !== required.size ||
      [...required].some((name) => !entries.has(name)) ||
      paths.some((path) => !isAbsolute(path)) ||
      new Set(paths).size !== paths.length
    ) return new Map();
    return entries;
  }
  return new Map([["home", resolve(dir, "../../..")]]);
}

export function verifiedHeads(dir) {
  return sectionEntries(join(dir, "9-implementation.md"), "## Verified heads", /^[0-9a-f]{40}$/);
}

function currentHead(path) {
  try {
    return git(path, ["rev-parse", "HEAD"]);
  } catch {
    return null;
  }
}

function implementationRecorded(dir) {
  const frontmatter = readFrontmatter(join(dir, "9-implementation.md"));
  const topic = topicFor(dir);
  if (
    !commonFieldsMatch(frontmatter, topic, "implementation") ||
    frontmatter.verdict !== "PASS" ||
    !taskRecorded(dir, topic)
  ) return false;

  const expected = worktreeMap(dir);
  const verified = verifiedHeads(dir);
  if (expected.size === 0 || verified.size !== expected.size) return false;
  for (const name of expected.keys()) if (!verified.has(name)) return false;
  return true;
}

export function implementationPassed(dir, headFor = currentHead) {
  if (!implementationRecorded(dir)) return false;
  const verified = verifiedHeads(dir);
  for (const [name, path] of worktreeMap(dir)) {
    if (headFor(path) !== verified.get(name)) return false;
  }
  return true;
}

export function prOpened(dir, headFor = currentHead) {
  const frontmatter = readFrontmatter(join(dir, "10-pr.md"));
  const topic = topicFor(dir);
  if (
    !commonFieldsMatch(frontmatter, topic, "pr") ||
    frontmatter.status !== "opened" ||
    !taskRecorded(dir, topic)
  ) return false;
  const worktrees = worktreeMap(dir);
  const pullRequests = sectionEntries(join(dir, "10-pr.md"), "## Pull requests", /^https:\/\//);
  const heads = sectionEntries(join(dir, "10-pr.md"), "## Heads", /^[0-9a-f]{40}$/);
  if (pullRequests.size === 0 || heads.size !== worktrees.size) return false;
  for (const name of pullRequests.keys()) {
    if (!worktrees.has(name) || !heads.has(name)) return false;
  }
  for (const [name, path] of worktrees) {
    if (!heads.has(name) || headFor(path) !== heads.get(name)) return false;
  }
  return true;
}

export function inferPhase(dir, headFor = currentHead) {
  const topic = topicFor(dir);
  const complete = (name, phase) => {
    const frontmatter = readFrontmatter(join(dir, name));
    return commonFieldsMatch(frontmatter, topic, phase);
  };

  if (!taskRecorded(dir, topic)) return "WORKTREE";
  if (!complete("2-questions.md", "questions")) return "QUESTION";
  if (!complete("5-research.md", "research")) return "RESEARCH";
  const design = readFrontmatter(join(dir, "6-design.md"));
  if (
    !commonFieldsMatch(design, topic, "design") ||
    !/^(0|[1-9]\d*)$/.test(design.revision ?? "") ||
    !designReviewPassed(dir, topic)
  ) return "DESIGN";
  if (!complete("7-structure.md", "structure")) return "STRUCTURE";
  if (!complete("8-plan.md", "plan")) return "PLAN";
  if (prOpened(dir, headFor) && implementationRecorded(dir)) return null;
  if (!implementationPassed(dir, headFor)) return "IMPLEMENT";
  return "PR";
}

export function phaseAction(currentPhase, requestedPhase) {
  const requested = requestedPhase.toUpperCase();
  const requestedIndex = PHASES.indexOf(requested);
  if (requestedIndex < 0) throw new Error(`Invalid phase: ${requestedPhase}`);
  if (currentPhase === null) return { action: "noop", current: "COMPLETE", requested };
  const currentIndex = PHASES.indexOf(currentPhase);
  if (requestedIndex < currentIndex) return { action: "noop", current: currentPhase, requested };
  if (requestedIndex === currentIndex) return { action: "run", current: currentPhase, requested };
  return { action: "blocked", current: currentPhase, requested };
}

export function findLatestTopic(rootDir, headFor = currentHead) {
  const candidates = new Map();
  for (const root of artifactRoots(rootDir)) {
    const plans = join(root, "docs", "plans");
    let entries;
    try {
      entries = readdirSync(plans, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !isTopicId(entry.name)) continue;
      const dir = join(plans, entry.name);
      let mtime = -Infinity;
      let reviewNames = [];
      try {
        reviewNames = readdirSync(dir).filter((name) => /^design-review-\d+\.md$/.test(name));
      } catch {
        // The phase-file reads below will also fail and skip this directory.
      }
      for (const name of [...PHASE_FILES, ...reviewNames]) {
        try {
          mtime = Math.max(mtime, statSync(join(dir, name)).mtimeMs);
        } catch {
          // Optional or not written yet.
        }
      }
      if (mtime === -Infinity) continue;
      const previous = candidates.get(entry.name);
      if (!previous || previous.mtime < mtime) candidates.set(entry.name, { id: entry.name, dir, mtime });
    }
  }
  return (
    [...candidates.values()]
      .sort((a, b) => b.mtime - a.mtime || a.id.localeCompare(b.id))
      .find(
        (candidate) =>
          taskRecorded(candidate.dir) &&
          isTeamRun(candidate.dir) &&
          inferPhase(candidate.dir, headFor) !== null,
      ) ?? null
  );
}

function usage() {
  process.stderr.write(
    "Usage: phase-state.mjs resolve <repo-root> <id> | inspect <artifact-dir> | select <artifact-dir> <phase>\n",
  );
}

function main() {
  const [command, target, value, ...extra] = process.argv.slice(2);
  const expected = command === "inspect" ? 0 : 1;
  if (
    !target ||
    !["resolve", "inspect", "select"].includes(command) ||
    extra.length > 0 ||
    (expected === 0 && value !== undefined) ||
    (expected === 1 && value === undefined)
  ) {
    usage();
    process.exitCode = 2;
    return;
  }
  if (command === "inspect") {
    if (!isArtifactDirectory(target)) {
      process.stderr.write(`Invalid artifact directory: ${target}\n`);
      process.exitCode = 2;
      return;
    }
    if (!directoryExists(target)) {
      process.stderr.write(`No artifact directory: ${target}\n`);
      process.exitCode = 3;
      return;
    }
    if (!isTeamRun(target)) {
      process.stderr.write(`Artifact directory is not a Team QRSPI run: ${target}\n`);
      process.exitCode = 4;
      return;
    }
    process.stdout.write(`${JSON.stringify({ dir: resolve(target), phase: inferPhase(target) ?? "COMPLETE" })}\n`);
    return;
  }
  if (command === "select") {
    if (!isArtifactDirectory(target)) {
      process.stderr.write(`Invalid artifact directory: ${target}\n`);
      process.exitCode = 2;
      return;
    }
    if (!directoryExists(target)) {
      process.stderr.write(`No artifact directory: ${target}\n`);
      process.exitCode = 3;
      return;
    }
    if (!isTeamRun(target)) {
      process.stderr.write(`Artifact directory is not a Team QRSPI run: ${target}\n`);
      process.exitCode = 4;
      return;
    }
    let selection;
    try {
      selection = phaseAction(inferPhase(target), value);
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(`${JSON.stringify({ dir: resolve(target), ...selection })}\n`);
    if (selection.action === "blocked") process.exitCode = 4;
    return;
  }
  if (!isTopicId(value)) {
    process.stderr.write(`Invalid topic id: ${value}\n`);
    process.exitCode = 2;
    return;
  }
  const dir = resolveArtifactDirectory(target, value);
  if (!dir) {
    process.stderr.write(`No artifact directory for ${value}\n`);
    process.exitCode = 3;
    return;
  }
  if (!isTeamRun(dir)) {
    process.stderr.write(`Artifact directory belongs to another workflow: ${value}\n`);
    process.exitCode = 4;
    return;
  }
  process.stdout.write(`${JSON.stringify({ id: value, dir, phase: inferPhase(dir) ?? "COMPLETE" })}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
