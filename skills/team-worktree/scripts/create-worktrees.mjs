#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { inspectRepo } from "./inspect-repo.mjs";

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function git(repo, args, allowFailure = false) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status === 0) return { ok: true, stdout: result.stdout };
  if (allowFailure) return { ok: false, stdout: "" };
  const detail = result.stderr.trim() || `exit ${result.status ?? "unknown"}`;
  throw new Error(`git ${args.join(" ")} failed: ${detail}`);
}

function stripLineEnding(value) {
  if (value.endsWith("\n")) return value.slice(0, -1);
  return value;
}

function ignoredCandidates(repo) {
  const output = execFileSync(
    "git",
    ["-C", repo, "ls-files", "--others", "--ignored", "--exclude-from=.worktreeinclude", "-z"],
    { encoding: "buffer" },
  );
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();
}

function isStandardIgnored(repo, path) {
  const result = spawnSync(
    "git",
    ["-C", repo, "check-ignore", "--quiet", "--no-index", "--", path],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  const detail = result.stderr.trim() || `exit ${result.status ?? "unknown"}`;
  throw new Error(`git check-ignore failed for ${path}: ${detail}`);
}

function containedPath(root, path) {
  const child = relative(root, path);
  return (
    child !== "" &&
    child !== ".." &&
    !child.startsWith(`..${sep}`) &&
    !isAbsolute(child)
  );
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

function repoRoot(path, label) {
  let actual;
  try {
    actual = realpathSync(resolve(path));
  } catch {
    throw new Error(`${label} must be an existing repository root: ${path}`);
  }
  const root = realpathSync(
    stripLineEnding(git(actual, ["rev-parse", "--show-toplevel"]).stdout),
  );
  if (actual !== root) throw new Error(`${label} must be a repository root: ${path}`);
  return root;
}

export function provisionIgnoredFiles(repo, worktree) {
  const include = join(repo, ".worktreeinclude");
  if (!existsSync(include)) return [];

  const copied = [];
  for (const path of ignoredCandidates(repo)) {
    if (!isStandardIgnored(repo, path)) continue;
    const source = resolve(repo, path);
    const destination = resolve(worktree, path);
    if (!containedPath(repo, source) || !containedPath(worktree, destination)) {
      throw new Error(`refusing .worktreeinclude path outside the repository: ${path}`);
    }
    const worktreesRoot = resolve(repo, ".claude", "worktrees");
    if (source === worktreesRoot || containedPath(worktreesRoot, source)) continue;
    assertNoDestinationSymlink(worktree, destination);
    if (existsSync(destination)) continue;
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, {
      errorOnExist: true,
      force: false,
      recursive: true,
      verbatimSymlinks: true,
    });
    copied.push(path);
  }
  return copied;
}

function validateBranch(branch) {
  if (typeof branch !== "string" || !branch || branch.includes("/")) {
    throw new Error("branch must be a non-empty slash-free name");
  }
  const result = spawnSync("git", ["check-ref-format", "--branch", branch], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`invalid branch name: ${branch}`);
}

function branchPoint(repo, defaultBranch) {
  const origin = git(repo, ["remote", "get-url", "origin"], true);
  if (!origin.ok) return defaultBranch;
  git(repo, ["fetch", "origin", "--quiet"]);
  const remoteHead = git(
    repo,
    ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
    true,
  );
  const remoteBranch = stripLineEnding(remoteHead.stdout);
  return remoteHead.ok && remoteBranch.startsWith("origin/")
    ? "origin/HEAD"
    : defaultBranch;
}

function provisionResult(base, worktreeStatus) {
  try {
    return {
      ...base,
      status: worktreeStatus,
      copied: provisionIgnoredFiles(base.repo, base.path),
    };
  } catch (error) {
    return {
      ...base,
      status: "provisioning-failed",
      worktreeStatus,
      message: `Worktree provisioning failed in ${base.name}.`,
      error: errorMessage(error),
    };
  }
}

function inspectDestination(target, branch) {
  const { repo, inspection } = target;
  const path = join(repo, ".claude", "worktrees", branch);
  const relativePath = join(".claude", "worktrees", branch);
  assertNoDestinationSymlink(repo, path);

  if (existsSync(path)) {
    const existing = inspectRepo(path);
    const actualPath = repoRoot(path, "existing worktree");
    const sameRepository =
      realpathSync(existing.commonDir) === realpathSync(inspection.commonDir);
    if (
      actualPath !== path
      || !containedPath(repo, actualPath)
      || !sameRepository
      || !existing.linked
      || existing.branch !== branch
    ) {
      throw new Error(`existing worktree does not match branch ${branch}: ${path}`);
    }
    return {
      path,
      relativePath,
      existing: {
        name: target.name,
        repo,
        path,
        branch,
        status: "reused",
        copied: [],
      },
    };
  }
  return { path, relativePath, existing: null };
}

function createWorktree(target, branch, destination) {
  const { repo, inspection } = target;
  const { path, relativePath, existing } = destination;
  if (existing) return existing;

  let source;
  try {
    source = branchPoint(repo, inspection.defaultBranch);
    git(repo, ["worktree", "add", relativePath, "-b", branch, source]);
  } catch (error) {
    const fallback = inspectRepo(repo);
    return {
      name: target.name,
      repo,
      path: repo,
      branch: fallback.branch,
      requestedBranch: branch,
      status: "fallback",
      message:
        `Worktree creation failed in ${target.name}. ` +
        "Falling back to main tree for that repo.",
      error: errorMessage(error),
    };
  }

  const created = inspectRepo(path);
  if (
    realpathSync(created.commonDir) !== realpathSync(inspection.commonDir)
    || !created.linked
    || created.branch !== branch
  ) {
    throw new Error(`created worktree failed validation: ${path}`);
  }
  return provisionResult({
    name: target.name,
    repo,
    path,
    branch,
    source,
  }, "created");
}

function validatedTargets(targets, homeRepo) {
  if (typeof homeRepo !== "string" || !homeRepo.trim()) {
    throw new Error("home repo is required");
  }
  const homeCheckout = repoRoot(homeRepo, "home");
  const home = repoRoot(inspectRepo(homeCheckout).primaryRoot, "home primary");
  const allowedParent = dirname(home);
  const names = new Set();
  const repos = new Set();

  const validated = targets.map((target) => {
    if (!target || typeof target.name !== "string" || !target.name.trim()) {
      throw new Error("every target requires a name");
    }
    if (typeof target.repo !== "string" || !target.repo.trim()) {
      throw new Error(`target ${target.name} requires a repo path`);
    }
    if (names.has(target.name)) throw new Error(`duplicate target name: ${target.name}`);
    names.add(target.name);

    const repo = repoRoot(target.repo, `target ${target.name}`);
    if (dirname(repo) !== allowedParent) {
      throw new Error(`target ${target.name} is not a sibling of the home repo: ${repo}`);
    }
    if (repos.has(repo)) throw new Error(`duplicate target repo: ${repo}`);
    repos.add(repo);

    const inspection = inspectRepo(repo);
    if (inspection.linked) {
      throw new Error(`target ${target.name} must be a primary checkout: ${repo}`);
    }
    return { name: target.name, repo, inspection };
  });
  return { home, validated };
}

function preserveHomeFallback(home, branch, artifactDir) {
  if (artifactDir === null) return false;
  if (typeof artifactDir !== "string" || !isAbsolute(artifactDir)) {
    throw new Error("preserved home artifact directory must be an absolute path");
  }
  const expected = join(home, "docs", "plans", branch);
  try {
    return statSync(artifactDir).isDirectory() && realpathSync(artifactDir) === expected;
  } catch {
    return false;
  }
}

function branchWorktreePaths(target, branch) {
  const branchRecord = `branch refs/heads/${branch}`;
  const paths = [];
  let path = null;
  for (const field of git(target.repo, ["worktree", "list", "--porcelain", "-z"])
    .stdout.split("\0")) {
    if (field.startsWith("worktree ")) {
      path = realpathSync(field.slice("worktree ".length));
    } else if (field === branchRecord && path !== null) {
      paths.push(path);
    }
  }
  return paths;
}

function assertNoCompetingBranchWorktree(target, branch, allowedPath) {
  const allowed = allowedPath === null ? null : realpathSync(allowedPath);
  const competing = branchWorktreePaths(target, branch).filter(
    (path) => path !== allowed,
  );
  if (competing.length > 0) {
    throw new Error(
      `recorded fallback ${target.name} conflicts with an existing ${branch} worktree`,
    );
  }
}

function markdownLayout(markdown) {
  if (typeof markdown !== "string") throw new Error("4-repos.md must be text");
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const headings = [];
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const marker = lines[index].match(/^[ \t]{0,3}(`{3,}|~{3,})/u)?.[1] ?? null;
    if (marker) {
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (/^[ \t]{0,3}#{1,6}(?:[ \t]+|$)/u.test(lines[index])) {
      headings.push(index);
    }
  }
  return { headings, lines };
}

function sectionLines(layout, name) {
  const pattern = new RegExp(`^##[ \\t]+${name}[ \\t]*$`, "u");
  const starts = layout.headings.filter((index) => pattern.test(layout.lines[index]));
  if (starts.length !== 1) {
    throw new Error(
      starts.length === 0
        ? `4-repos.md has no ${name} section`
        : `4-repos.md has multiple ${name} sections`,
    );
  }
  const start = starts[0];
  const end = layout.headings.find((index) => index > start) ?? layout.lines.length;
  return layout.lines.slice(start + 1, end);
}

export function parseWorktreeSection(markdown, expectedNames) {
  if (!Array.isArray(expectedNames)) {
    throw new Error("worktree section requires expected names");
  }
  const expected = new Set(expectedNames);
  if (
    expected.size !== expectedNames.length ||
    expectedNames.some((name) => typeof name !== "string" || !name)
  ) {
    throw new Error("expected worktree names must be unique and non-empty");
  }

  const entries = new Map();
  for (const line of sectionLines(markdownLayout(markdown), "Worktrees")) {
    if (line.trim() === "") continue;
    const match = line.match(/^- ([^:\r\n]+): (.+)$/u);
    if (!match) throw new Error(`invalid Worktrees entry: ${line}`);
    const name = match[1].trim();
    const path = match[2];
    if (entries.has(name)) throw new Error(`duplicate Worktrees entry: ${name}`);
    entries.set(name, path);
  }

  for (const name of entries.keys()) {
    if (!expected.has(name)) throw new Error(`unknown Worktrees entry: ${name}`);
  }
  for (const name of expected) {
    if (!entries.has(name)) throw new Error(`missing Worktrees entry: ${name}`);
  }
  return entries;
}

export function parseRepoInventory(markdown) {
  const layout = markdownLayout(markdown);
  const home = {};
  for (const line of sectionLines(layout, "Home repo")) {
    if (line.trim() === "") continue;
    const match = line.match(/^- \*\*(name|path|role):\*\* (.+)$/u);
    if (!match) throw new Error(`invalid Home repo entry: ${line}`);
    if (home[match[1]] !== undefined) {
      throw new Error(`duplicate Home repo field: ${match[1]}`);
    }
    home[match[1]] = match[1] === "path" ? match[2] : match[2].trim();
  }
  for (const field of ["name", "path", "role"]) {
    if (!home[field]) throw new Error(`missing Home repo field: ${field}`);
  }

  const additional = [];
  let current = null;
  for (const line of sectionLines(layout, "Additional repos")) {
    if (line.trim() === "") continue;
    const name = line.match(/^- \*\*name:\*\* (.+)$/u);
    if (name) {
      if (current !== null) additional.push(current);
      current = { name: name[1].trim() };
      continue;
    }
    const field = line.match(/^  \*\*(path|role):\*\* (.+)$/u);
    if (!field || current === null) {
      throw new Error(`invalid Additional repos entry: ${line}`);
    }
    if (current[field[1]] !== undefined) {
      throw new Error(`duplicate Additional repos field: ${field[1]}`);
    }
    current[field[1]] = field[1] === "path" ? field[2] : field[2].trim();
  }
  if (current !== null) additional.push(current);
  if (additional.length === 0) throw new Error("Additional repos must not be empty");
  for (const repo of additional) {
    for (const field of ["name", "path", "role"]) {
      if (!repo[field]) throw new Error(`missing ${repo.name} field: ${field}`);
    }
  }
  const names = [home.name, ...additional.map((repo) => repo.name)];
  if (new Set(names).size !== names.length) throw new Error("repo names must be unique");
  if (additional.some((repo) => repo.name === "home")) {
    throw new Error("additional repo name home is reserved");
  }
  return { home, additional };
}

function validateRecordedTargets(inventory, validated, home) {
  const declared = [inventory.home, ...inventory.additional];
  const targets = new Map(validated.map((target) => [target.name, target]));
  if (targets.size !== declared.length) {
    throw new Error("target inventory does not match 4-repos.md");
  }
  for (const repo of declared) {
    const target = targets.get(repo.name);
    if (!target) throw new Error(`missing target for declared repo: ${repo.name}`);
    if (!isAbsolute(repo.path)) {
      throw new Error(`declared repo ${repo.name} path must be absolute`);
    }
    const checkout = repoRoot(repo.path, `declared repo ${repo.name}`);
    const primary = repoRoot(inspectRepo(checkout).primaryRoot, `${repo.name} primary`);
    if (target.repo !== primary) {
      throw new Error(`target ${repo.name} does not match its declared repository`);
    }
  }
  const homeTarget = targets.get(inventory.home.name);
  if (homeTarget.repo !== home) throw new Error("declared home does not match --home");
  return { homeTarget, targets };
}

function recoveredWorktrees(reposFile, validated, home, branch, preserveHome) {
  if (reposFile === null) return new Map();
  if (typeof reposFile !== "string" || !isAbsolute(reposFile)) {
    throw new Error("recovery 4-repos.md path must be absolute");
  }
  try {
    if (!statSync(reposFile).isFile()) throw new Error();
  } catch {
    throw new Error(`recovery 4-repos.md must be an existing file: ${reposFile}`);
  }

  const markdown = readFileSync(reposFile, "utf8");
  const inventory = parseRepoInventory(markdown);
  const { homeTarget, targets } = validateRecordedTargets(inventory, validated, home);
  const entries = parseWorktreeSection(markdown, [
    "home",
    ...inventory.additional.map((repo) => repo.name),
  ]);
  const recovered = new Map();
  for (const [name, path] of entries) {
    if (!isAbsolute(path)) {
      throw new Error(`recorded worktree ${name} path must be absolute`);
    }
    const target = name === "home" ? homeTarget : targets.get(name);
    const root = repoRoot(path, `recorded worktree ${name}`);
    const inspection = inspectRepo(root);
    if (realpathSync(inspection.primaryRoot) !== target.repo) {
      throw new Error(`recorded worktree ${name} belongs to another repository: ${root}`);
    }
    if (inspection.linked) {
      assertNoCompetingBranchWorktree(
        target,
        branch,
        inspection.branch === branch ? root : null,
      );
      if (inspection.onDefaultBranch) {
        throw new Error(`recorded worktree ${name} uses the default branch: ${root}`);
      }
      recovered.set(target.name, {
        name: target.name,
        repo: target.repo,
        path: root,
        branch: inspection.branch,
        status: "reused",
        copied: [],
      });
      continue;
    }
    assertNoCompetingBranchWorktree(target, branch, target.repo);
    if (target.repo === home && !preserveHome) {
      throw new Error("recorded home fallback requires --preserve-existing-home");
    }
    recovered.set(
      target.name,
      preservedFallback(target, branch, target.repo === home),
    );
  }
  return recovered;
}

function preservedFallback(target, branch, home = false) {
  return {
    name: target.name,
    repo: target.repo,
    path: target.repo,
    branch: target.inspection.branch,
    requestedBranch: branch,
    status: "fallback",
    preserved: true,
    message: home
      ? `Reusing the recorded in-place home fallback in ${target.name}.`
      : `Reusing the recorded in-place fallback in ${target.name}.`,
    error: null,
  };
}

export function createWorktrees(
  targets,
  branch,
  homeRepo,
  artifactDir = null,
  reposFile = null,
) {
  validateBranch(branch);
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error("at least one target is required");
  }
  const { home, validated } = validatedTargets(targets, homeRepo);
  const preserveHome = preserveHomeFallback(home, branch, artifactDir);
  const recovered = recoveredWorktrees(
    reposFile,
    validated,
    home,
    branch,
    preserveHome,
  );
  const destinations = validated.map((target) => inspectDestination(target, branch));
  if (preserveHome) {
    const homeTarget = validated.find((target) => target.repo === home);
    if (homeTarget && !recovered.has(homeTarget.name)) {
      assertNoCompetingBranchWorktree(homeTarget, branch, homeTarget.repo);
    }
  }
  return validated.map((target, index) => {
    if (recovered.has(target.name)) return recovered.get(target.name);
    if (preserveHome && target.repo === home) {
      return preservedFallback(target, branch, true);
    }
    return createWorktree(target, branch, destinations[index]);
  });
}

function parseArgs(argv) {
  let branch = null;
  let home = null;
  let artifactDir = null;
  let reposFile = null;
  const targets = [];
  for (let index = 0; index < argv.length; ) {
    if (argv[index] === "--branch" && argv[index + 1]) {
      if (branch !== null) throw new Error("--branch may appear only once");
      branch = argv[index + 1];
      index += 2;
      continue;
    }
    if (argv[index] === "--home" && argv[index + 1]) {
      if (home !== null) throw new Error("--home may appear only once");
      home = argv[index + 1];
      index += 2;
      continue;
    }
    if (argv[index] === "--preserve-existing-home" && argv[index + 1]) {
      if (artifactDir !== null) throw new Error("--preserve-existing-home may appear only once");
      artifactDir = argv[index + 1];
      index += 2;
      continue;
    }
    if (argv[index] === "--target" && argv[index + 1] && argv[index + 2]) {
      targets.push({ name: argv[index + 1], repo: argv[index + 2] });
      index += 3;
      continue;
    }
    if (argv[index] === "--recover-worktrees" && argv[index + 1]) {
      if (reposFile !== null) throw new Error("--recover-worktrees may appear only once");
      reposFile = argv[index + 1];
      index += 2;
      continue;
    }
    throw new Error(
      "usage: create-worktrees.mjs --branch <name> --home <repo> [--preserve-existing-home <artifact-dir>] [--recover-worktrees <4-repos.md>] --target <name> <repo> [--target ...]",
    );
  }
  if (branch === null) throw new Error("--branch is required");
  if (home === null) throw new Error("--home is required");
  return { branch, home, artifactDir, reposFile, targets };
}

function main() {
  try {
    const { branch, home, artifactDir, reposFile, targets } = parseArgs(
      process.argv.slice(2),
    );
    const outcomes = createWorktrees(
      targets,
      branch,
      home,
      artifactDir,
      reposFile,
    );
    process.stdout.write(JSON.stringify(outcomes) + "\n");
    if (outcomes.some((outcome) => outcome.status === "provisioning-failed")) {
      process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write(`create-worktrees: ${errorMessage(error)}\n`);
    process.exitCode = 2;
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main();
