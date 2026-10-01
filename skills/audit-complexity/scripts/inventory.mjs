#!/usr/bin/env node
// Lists the tracked files and their line counts for an audit-complexity scope and writes inventory.json beside it.
// Usage: inventory.mjs <report.json>
import { spawn } from "node:child_process";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { pathToFileURL } from "node:url";

const SCRIPT = "inventory.mjs";
// git's own binary test: a NUL byte in the first 8,000 bytes.
const BINARY_PROBE_BYTES = 8000;
const LINE_FEED = 0x0a;
const SUBMODULE_MODE = "160000";
const SYMLINK_MODE = "120000";

class AuditError extends Error {}

// --no-optional-locks keeps every call off index.lock, so the audit never blocks a concurrent git command.
const gitArgv = (...args) => ["--no-optional-locks", ...args];

export function buildGitArgs({ pathspecs, exclude }) {
  const exclusions = exclude.map((path) => `:(exclude,literal)${path}`);
  return {
    topLevel: gitArgv("rev-parse", "--show-toplevel"),
    head: gitArgv("rev-parse", "--verify", "HEAD"),
    lsFiles: pathspecs.map((pathspec) => gitArgv("ls-files", "-z", "--stage", "--", `:(literal)${pathspec}`, ...exclusions)),
    // autoRefreshIndex keeps a file whose stat changed but whose content did not out of the dirty list.
    diff: gitArgv(
      "-c",
      "diff.autoRefreshIndex=true",
      "diff",
      "-z",
      "--name-only",
      "--no-renames",
      "--no-color",
      "--ignore-submodules=untracked",
      "HEAD",
      "--",
    ),
  };
}

export function listDirty(diff, inventory) {
  const audited = new Set(inventory);
  return [...new Set(diff.split("\0").filter((path) => audited.has(path)))].sort();
}

function countLines(bytes) {
  let lines = 0;
  for (const byte of bytes) if (byte === LINE_FEED) lines += 1;
  const unterminated = bytes.length > 0 && bytes[bytes.length - 1] !== LINE_FEED;
  return unterminated ? lines + 1 : lines;
}

const notMeasured = (status) => ({ status, lines: 0 });

// Opens only a regular file whose real path stays inside the top level, so no read leaves the repository.
export function classifyStatus(topLevel, key, mode) {
  if (mode === SUBMODULE_MODE) return notMeasured("submodule");
  if (mode === SYMLINK_MODE) return notMeasured("symlink");
  const path = join(topLevel, key);
  let bytes;
  try {
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) return notMeasured("symlink");
    if (!stats.isFile()) return notMeasured("unreadable");
    if (!realpathSync(path).startsWith(realpathSync(topLevel) + sep)) return notMeasured("symlink");
    bytes = readFileSync(path);
  } catch (error) {
    return notMeasured(error.code === "ENOENT" || error.code === "ENOTDIR" ? "missing" : "unreadable");
  }
  if (bytes.subarray(0, BINARY_PROBE_BYTES).includes(0)) return notMeasured("binary");
  return { status: "text", lines: countLines(bytes) };
}

async function git(args, cwd) {
  const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  const closed = new Promise((resolve) => {
    child.on("error", (error) => resolve({ error }));
    child.on("close", (code) => resolve({ code }));
  });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (text) => {
    stderr += text;
  });
  let stdout = "";
  try {
    for await (const text of child.stdout.setEncoding("utf8")) stdout += text;
  } catch (error) {
    child.kill();
    throw error;
  }
  const { code, error } = await closed;
  if (error) throw new AuditError(`cannot run git: ${error.message}`);
  if (code !== 0) throw new AuditError(`git ${args.join(" ")} failed: ${stderr.trim() || `exit code ${code}`}`);
  return stdout;
}

function parseLsFiles(text) {
  const modes = new Map();
  for (const line of text.split("\0")) {
    if (line === "") continue;
    const tab = line.indexOf("\t");
    modes.set(line.slice(tab + 1), line.slice(0, line.indexOf(" ")));
  }
  return modes;
}

function readScope(input) {
  let report;
  try {
    report = JSON.parse(readFileSync(input, "utf8"));
  } catch (error) {
    throw new AuditError(`cannot read ${input}: ${error.message}`);
  }
  if (report?.skill !== "audit-complexity" || report.version !== 1) {
    throw new AuditError(`${input} is not an audit-complexity version 1 report`);
  }
  const { pathspecs, exclude } = report.scope ?? {};
  if (!Array.isArray(pathspecs) || pathspecs.length === 0 || !pathspecs.every((p) => typeof p === "string" && p !== "")) {
    throw new AuditError(`${input}: scope.pathspecs must be a non-empty list of paths`);
  }
  if (!Array.isArray(exclude) || !exclude.every((e) => typeof e?.path === "string" && e.path !== "")) {
    throw new AuditError(`${input}: scope.exclude must be a list of { path, reason } records`);
  }
  return { pathspecs, exclude: exclude.map((e) => e.path) };
}

async function collectInventory(scope) {
  const args = buildGitArgs(scope);
  const topLevel = (await git(args.topLevel, process.cwd())).replace(/\n$/, "");
  const commit = (await git(args.head, topLevel)).trim();

  const modes = new Map();
  for (const [i, lsFiles] of args.lsFiles.entries()) {
    const matched = parseLsFiles(await git(lsFiles, topLevel));
    if (matched.size === 0) throw new AuditError(`no tracked file under ${topLevel} matches ${scope.pathspecs[i]}`);
    for (const [path, mode] of matched) modes.set(path, mode);
  }
  const inventory = [...modes.keys()].sort();

  return {
    version: 1,
    commit,
    pathspecs: scope.pathspecs,
    exclude: scope.exclude,
    dirty: listDirty(await git(args.diff, topLevel), inventory),
    files: Object.fromEntries(inventory.map((path) => [path, classifyStatus(topLevel, path, modes.get(path))])),
  };
}

function refuseSymlink(target) {
  let stats;
  try {
    stats = lstatSync(target);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw new AuditError(`cannot check ${target}: ${error.message}`);
  }
  if (stats.isSymbolicLink()) throw new AuditError(`${target} is a symlink, and the script never writes through one`);
}

async function main(args) {
  const [input] = args;
  if (!input) {
    process.stderr.write(`${SCRIPT}: usage: ${SCRIPT} <report.json>\n`);
    return 2;
  }
  const target = join(dirname(input), "inventory.json");
  let inventory;
  try {
    inventory = await collectInventory(readScope(input));
    refuseSymlink(target);
  } catch (error) {
    if (!(error instanceof AuditError)) throw error;
    process.stderr.write(`${SCRIPT}: ${error.message}\n`);
    return 1;
  }
  writeFileSync(target, `${JSON.stringify(inventory, null, 2)}\n`);
  process.stdout.write(`${target}\n`);
  return 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
