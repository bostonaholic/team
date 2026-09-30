#!/usr/bin/env node
// Collects git churn and file sizes for an audit-complexity scope and writes history.json beside it.
// Usage: git-history.mjs <report.json>
import { spawn } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const SCRIPT = "git-history.mjs";
const RECORD_START = "\x1e";
const HASH_END = "\x1f";
// git's own binary test: a NUL byte in the first 8,000 bytes.
const BINARY_PROBE_BYTES = 8000;
const LINE_FEED = 0x0a;

class AuditError extends Error {}

export function buildGitArgs({ pathspecs, exclude, since }) {
  const exclusions = exclude.map((path) => `:(exclude)${path}`);
  return {
    topLevel: ["rev-parse", "--show-toplevel"],
    head: ["rev-parse", "--verify", "HEAD"],
    lsFiles: pathspecs.map((pathspec) => ["ls-files", "-z", "--stage", "--", pathspec, ...exclusions]),
    log: [
      "log",
      "-z",
      "--format=%x1e%H%x1f%aN",
      "--name-status",
      ...(since === null ? [] : [`--since=${since}`]),
      "HEAD",
      "--",
    ],
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
  const author = record.slice(hashEnd + 1, authorEnd === -1 ? undefined : authorEnd);
  const tokens = authorEnd === -1 ? [] : record.slice(authorEnd + 1).split("\0");
  return { hash, author, changes: parseChanges(tokens) };
}

export function parseLog(text) {
  return text.split(RECORD_START).slice(1).map(parseRecord);
}

function createFold(inventory) {
  const commits = new Map(inventory.map((path) => [path, 0]));
  let scanned = 0;
  return {
    add(commit) {
      scanned += 1;
      const touched = new Set(commit.changes.map((change) => change.paths.at(-1)));
      for (const path of touched) {
        if (commits.has(path)) commits.set(path, commits.get(path) + 1);
      }
    },
    finish() {
      const files = Object.fromEntries([...commits].map(([path, count]) => [path, { commits: count }]));
      return { commitsScanned: scanned, files };
    },
  };
}

export function buildHistory({ log, inventory }) {
  const fold = createFold(inventory);
  for (const commit of parseLog(log)) fold.add(commit);
  return fold.finish();
}

function countLines(bytes) {
  let lines = 0;
  for (const byte of bytes) if (byte === LINE_FEED) lines += 1;
  const unterminated = bytes.length > 0 && bytes[bytes.length - 1] !== LINE_FEED;
  return unterminated ? lines + 1 : lines;
}

export function classifyStatus(topLevel, key) {
  const bytes = readFileSync(join(topLevel, key));
  if (bytes.subarray(0, BINARY_PROBE_BYTES).includes(0)) return { status: "binary", lines: 0 };
  return { status: "text", lines: countLines(bytes) };
}

async function git(args, cwd, onStdout = null) {
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

  const modes = new Map();
  for (const lsFiles of args.lsFiles) {
    for (const [path, mode] of parseLsFiles((await git(lsFiles, topLevel)).stdout)) modes.set(path, mode);
  }
  const inventory = [...modes.keys()].sort();

  const fold = createFold(inventory);
  const log = streamingLog(fold);
  await git(args.log, topLevel, (text) => log.push(text));
  log.end();
  const churn = fold.finish();

  const files = Object.fromEntries(
    inventory.map((path) => [path, { ...classifyStatus(topLevel, path), ...churn.files[path] }]),
  );
  return {
    version: 1,
    commit,
    pathspecs: scope.pathspecs,
    exclude: scope.exclude,
    since: scope.since,
    commitsScanned: churn.commitsScanned,
    files,
  };
}

async function main(args) {
  const [input] = args;
  if (!input) {
    process.stderr.write(`${SCRIPT}: usage: ${SCRIPT} <report.json>\n`);
    return 2;
  }
  let history;
  try {
    history = await collectHistory(readScope(input));
  } catch (error) {
    if (!(error instanceof AuditError)) throw error;
    process.stderr.write(`${SCRIPT}: ${error.message}\n`);
    return 1;
  }
  const target = join(dirname(input), "history.json");
  writeFileSync(target, `${JSON.stringify(history, null, 2)}\n`);
  process.stdout.write(`${target}\n`);
  return 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
