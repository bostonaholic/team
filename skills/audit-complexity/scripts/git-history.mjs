#!/usr/bin/env node
// Collects git churn and file sizes for an audit-complexity scope and writes history.json beside it.
// Usage: git-history.mjs <report.json>
import { spawn } from "node:child_process";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { pathToFileURL } from "node:url";

const SCRIPT = "git-history.mjs";
const RECORD_START = "\x1e";
const HASH_END = "\x1f";
// git's own binary test: a NUL byte in the first 8,000 bytes.
const BINARY_PROBE_BYTES = 8000;
const LINE_FEED = 0x0a;
const SUBMODULE_MODE = "160000";
const SYMLINK_MODE = "120000";
// A commit that touches more files than this is a sweep, such as a rename or a format run, not a coupling signal.
const MAX_COUPLING_COMMIT_FILES = 30;
const MIN_SHARED_COMMITS = 3;
const MAX_PARTNERS = 3;
const HEX_HASH = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
// git prints this under LC_ALL=C when a commit has more rename candidates than -l allows.
const RENAME_LIMIT_WARNING = /rename detection was skipped due to too many files/;
// The C locale keeps git's warnings in the English text RENAME_LIMIT_WARNING matches.
const GIT_ENV = { ...process.env, LC_ALL: "C" };
// Each flag pins an output that user, repo, or system config could otherwise change.
const LOG_PINS = ["-M", "-l1000", "--no-show-signature", "--no-color", "--ignore-submodules=untracked", "--encoding=UTF-8"];
const DIFF_PINS = ["-M", "-l1000", "--no-color", "--ignore-submodules=untracked"];

class AuditError extends Error {}

// --no-optional-locks keeps every call off index.lock, so the audit never blocks a concurrent git command.
const gitArgv = (...args) => ["--no-optional-locks", ...args];

export function buildGitArgs({ pathspecs, exclude, since }) {
  const exclusions = exclude.map((path) => `:(exclude,literal)${path}`);
  return {
    topLevel: gitArgv("rev-parse", "--show-toplevel"),
    head: gitArgv("rev-parse", "--verify", "HEAD"),
    shallow: gitArgv("rev-parse", "--is-shallow-repository"),
    lsFiles: pathspecs.map((pathspec) => gitArgv("ls-files", "-z", "--stage", "--", `:(literal)${pathspec}`, ...exclusions)),
    partners: gitArgv("ls-files", "-z", "--stage", "--", ".", ...exclusions),
    diff: gitArgv("-c", "diff.autoRefreshIndex=true", "diff", "-z", "--name-status", ...DIFF_PINS, "HEAD", "--"),
    log: gitArgv(
      "-c",
      "log.showRoot=true",
      "log",
      "-z",
      "--format=%x1e%H%x1f%aN",
      "--name-status",
      ...LOG_PINS,
      ...(since === null ? [] : [`--since=${since}`]),
      "HEAD",
      "--",
    ),
  };
}

// Tokens after the author are NUL-terminated; a "\n" separates the format line from the first status.
function parseChanges(tokens) {
  const changes = [];
  let i = 0;
  while (i < tokens.length) {
    const status = tokens[i].replace(/^\n/, "");
    i += 1;
    if (status === "") continue;
    const pathCount = /^[RC]/.test(status) ? 2 : 1;
    changes.push({ status: status[0], paths: tokens.slice(i, i + pathCount) });
    i += pathCount;
  }
  return changes;
}

function parseRecord(record) {
  const hashEnd = record.indexOf(HASH_END);
  const authorEnd = record.indexOf("\0", hashEnd);
  const hash = record.slice(0, hashEnd);
  if (hashEnd === -1 || !HEX_HASH.test(hash)) {
    throw new AuditError(`git log record does not start with a hex hash: ${JSON.stringify(record.slice(0, 80))}`);
  }
  const author = record.slice(hashEnd + 1, authorEnd === -1 ? undefined : authorEnd);
  const tokens = authorEnd === -1 ? [] : record.slice(authorEnd + 1).split("\0");
  return { hash, author, changes: parseChanges(tokens) };
}

export function parseLog(text) {
  return text.split(RECORD_START).slice(1).map(parseRecord);
}

const parseNameStatus = (text) => parseChanges(text.split("\0"));

// Maps each name a file had at the current point in history to the current paths it became.
function createNames(paths) {
  const names = new Map(paths.map((path) => [path, new Set([path])]));
  return {
    currentPathsOf: (name) => names.get(name) ?? [],
    // Reading newest first, a rename's old name carries the new name's current paths into older commits.
    rename([from, to]) {
      const current = names.get(to);
      if (current) names.set(from, new Set([...(names.get(from) ?? []), ...current]));
    },
  };
}

function topPartners(shared) {
  return [...shared]
    .filter(([, count]) => count >= MIN_SHARED_COMMITS)
    .sort(([pathA, a], [pathB, b]) => b - a || (pathA < pathB ? -1 : pathA > pathB ? 1 : 0))
    .slice(0, MAX_PARTNERS)
    .map(([path, count]) => ({ path, shared: count }));
}

function createFold({ inventory, partners, diff }) {
  const commits = new Map(inventory.map((path) => [path, 0]));
  const authors = new Map(inventory.map((path) => [path, new Set()]));
  const shared = new Map(inventory.map((path) => [path, new Map()]));
  const partnerSet = new Set(partners);
  const names = createNames([...new Set([...inventory, ...partners])]);
  const uncommitted = parseNameStatus(diff);
  for (const change of uncommitted) if (change.status === "R") names.rename(change.paths);
  const inInventory = (path) => commits.has(path);
  const dirty = [...new Set(uncommitted.flatMap((change) => change.paths).filter(inInventory))].sort();
  let scanned = 0;
  return {
    add(commit) {
      scanned += 1;
      // Count against the names as they stand after this commit, then apply its renames for older commits.
      const touched = new Set(commit.changes.flatMap((change) => [...names.currentPathsOf(change.paths.at(-1))]));
      const audited = [...touched].filter(inInventory);
      for (const path of audited) {
        commits.set(path, commits.get(path) + 1);
        authors.get(path).add(commit.author);
      }
      if (commit.changes.length <= MAX_COUPLING_COMMIT_FILES) {
        const touchedPartners = [...touched].filter((path) => partnerSet.has(path));
        for (const path of audited) {
          const counts = shared.get(path);
          for (const partner of touchedPartners.filter((other) => other !== path)) {
            counts.set(partner, (counts.get(partner) ?? 0) + 1);
          }
        }
      }
      for (const change of commit.changes) if (change.status === "R") names.rename(change.paths);
    },
    finish(logStderr) {
      const files = Object.fromEntries(
        [...commits].map(([path, count]) => [
          path,
          { commits: count, authors: authors.get(path).size, coupling: topPartners(shared.get(path)) },
        ]),
      );
      return { renameDetectionSkipped: RENAME_LIMIT_WARNING.test(logStderr), commitsScanned: scanned, dirty, files };
    },
  };
}

export function buildHistory({ log, logStderr = "", diff = "", inventory, partners = [] }) {
  const fold = createFold({ inventory, partners, diff });
  for (const commit of parseLog(log)) fold.add(commit);
  return fold.finish(logStderr);
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

async function git(args, cwd, onStdout = null) {
  const child = spawn("git", args, { cwd, env: GIT_ENV, stdio: ["ignore", "pipe", "pipe"] });
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
    for await (const text of child.stdout.setEncoding("utf8")) {
      if (onStdout) onStdout(text);
      else stdout += text;
    }
  } catch (error) {
    child.kill();
    throw error;
  }
  const { code, error } = await closed;
  if (error) throw new AuditError(`cannot run git: ${error.message}`);
  if (code !== 0) throw new AuditError(`git ${args.join(" ")} failed: ${stderr.trim() || `exit code ${code}`}`);
  return { stdout, stderr };
}

// Parses records as they arrive, so a long history never sits in memory whole.
function streamingLog(fold) {
  let pending = "";
  return {
    push(text) {
      pending += text;
      const cut = pending.lastIndexOf(RECORD_START);
      if (cut <= 0) return;
      for (const commit of parseLog(pending.slice(0, cut))) fold.add(commit);
      pending = pending.slice(cut);
    },
    end() {
      for (const commit of parseLog(pending)) fold.add(commit);
      pending = "";
    },
  };
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
  const { pathspecs, exclude, since } = report.scope ?? {};
  if (!Array.isArray(pathspecs) || pathspecs.length === 0 || !pathspecs.every((p) => typeof p === "string" && p !== "")) {
    throw new AuditError(`${input}: scope.pathspecs must be a non-empty list of paths`);
  }
  if (!Array.isArray(exclude) || !exclude.every((e) => typeof e?.path === "string" && e.path !== "")) {
    throw new AuditError(`${input}: scope.exclude must be a list of { path, reason } records`);
  }
  if (since !== null && (typeof since !== "string" || since === "")) {
    throw new AuditError(`${input}: scope.since must be null or a date string`);
  }
  return { pathspecs, exclude: exclude.map((e) => e.path), since };
}

async function collectHistory(scope) {
  const args = buildGitArgs(scope);
  const topLevel = (await git(args.topLevel, process.cwd())).stdout.replace(/\n$/, "");
  const commit = (await git(args.head, topLevel)).stdout.trim();
  const shallow = (await git(args.shallow, topLevel)).stdout.trim() === "true";

  const modes = new Map();
  for (const [i, lsFiles] of args.lsFiles.entries()) {
    const matched = parseLsFiles((await git(lsFiles, topLevel)).stdout);
    if (matched.size === 0) throw new AuditError(`no tracked file under ${topLevel} matches ${scope.pathspecs[i]}`);
    for (const [path, mode] of matched) modes.set(path, mode);
  }
  const inventory = [...modes.keys()].sort();

  const partners = [...parseLsFiles((await git(args.partners, topLevel)).stdout).keys()];
  const fold = createFold({ inventory, partners, diff: (await git(args.diff, topLevel)).stdout });
  const log = streamingLog(fold);
  const { stderr: logStderr } = await git(args.log, topLevel, (text) => log.push(text));
  log.end();
  const churn = fold.finish(logStderr);

  const files = Object.fromEntries(
    inventory.map((path) => [path, { ...classifyStatus(topLevel, path, modes.get(path)), ...churn.files[path] }]),
  );
  return {
    version: 1,
    commit,
    pathspecs: scope.pathspecs,
    exclude: scope.exclude,
    since: scope.since,
    shallow,
    renameDetectionSkipped: churn.renameDetectionSkipped,
    commitsScanned: churn.commitsScanned,
    dirty: churn.dirty,
    files,
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
  const target = join(dirname(input), "history.json");
  let history;
  try {
    history = await collectHistory(readScope(input));
    refuseSymlink(target);
  } catch (error) {
    if (!(error instanceof AuditError)) throw error;
    process.stderr.write(`${SCRIPT}: ${error.message}\n`);
    return 1;
  }
  writeFileSync(target, `${JSON.stringify(history, null, 2)}\n`);
  process.stdout.write(`${target}\n`);
  return 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
