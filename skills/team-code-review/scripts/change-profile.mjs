#!/usr/bin/env node
// Measure a review range and pick its review depth. Reads git objects for the
// given SHAs only; never reads HEAD or the work tree, and writes nothing.
//
//   usage: change-profile.mjs <worktree-path> <merge-base-sha> <head-sha> [<worktree-path> <merge-base-sha> <head-sha> ...]
//
// Pass one triple per worktree with branch commits. Each SHA is 40 or 64
// lowercase hex characters. Per triple, the script runs two fixed git reads:
//
//   git -C <worktree-path> diff --numstat -z --find-renames --no-ext-diff --no-textconv <merge-base-sha> <head-sha> --
//   git -C <worktree-path> diff --name-status -z --find-renames --no-ext-diff <merge-base-sha> <head-sha> --
//
// Output on exit 0, six lines in this order:
//
//   depth=<light|standard>
//   base_depth=<light|standard>
//   lines=<n>     added plus deleted lines; a binary file adds none
//   files=<n>     changed files; a rename is one file
//   areas=<n>     per triple, the distinct first-two-directory prefixes of
//                 every changed path (both sides of a rename), with `.` for a
//                 root-level file; summed across triples
//   risk=<none|class[,class...]>
//
// Risk classes, listed in this byte order:
//
//   config          a path whose first component starts with `.`
//   multi-repo      two or more triples
//   removal         a deleted or renamed path
//   sensitive-path  a path with a token that equals a term, or a term plus `s`
//
// Terms: acl auth authenticate authentication authn authorization authorize
// authz cert cipher cors credential crypto csrf decrypt encrypt jwt login
// logout migrate migration oauth passwd password permission policies policy
// rbac sanitize secret security session ssl tls token.
//
// Tokens: split the path on runs of characters outside [A-Za-z0-9], then at
// each lowercase-to-uppercase boundary, and before the last capital of a
// capital run that a lowercase letter follows (`JWTVerifier` gives `jwt` and
// `verifier`). Lowercase each token.
//
// Depth: `base_depth` is `light` when lines <= 20 and files <= 3, else
// `standard`. Any risk class raises `light` to `standard`; the result is
// `depth`.
//
// Two configuration effects the fixed flags do not pin: `diff.renameLimit`
// can turn renames into delete-and-add pairs on large ranges, and a
// `.gitattributes` `binary` or `-diff` entry makes a text file count no lines.
//
// Exit codes:
//
//   0  profiled; stdout holds the six lines
//   2  fault: usage, a malformed SHA, git missing, a failed git read, or git
//      output over the 64 MiB buffer. Stderr holds one line,
//      `change-profile.mjs: <message>`, and stdout stays empty.
//
// The script has no exit 1.
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SCRIPT = "change-profile.mjs";
const USAGE = "usage: change-profile.mjs <worktree-path> <merge-base-sha> <head-sha> [...]";
const ARGS_PER_RANGE = 3;
const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;

const LIGHT_MAX_LINES = 20;
const LIGHT_MAX_FILES = 3;

const SENSITIVE_TERMS = new Set([
  "acl", "auth", "authenticate", "authentication", "authn", "authorization", "authorize",
  "authz", "cert", "cipher", "cors", "credential", "crypto", "csrf", "decrypt", "encrypt",
  "jwt", "login", "logout", "migrate", "migration", "oauth", "passwd", "password",
  "permission", "policies", "policy", "rbac", "sanitize", "secret", "security", "session",
  "ssl", "tls", "token",
]);
const RISK_ORDER = ["config", "multi-repo", "removal", "sensitive-path"];

class Fault extends Error {}

function parseRanges(args) {
  if (args.length === 0 || args.length % ARGS_PER_RANGE !== 0) throw new Fault(USAGE);
  const ranges = [];
  for (let i = 0; i < args.length; i += ARGS_PER_RANGE) {
    const [worktree, base, head] = args.slice(i, i + ARGS_PER_RANGE);
    for (const sha of [base, head]) {
      if (!SHA_PATTERN.test(sha)) throw new Fault(`malformed SHA, not 40 or 64 lowercase hex characters: ${sha}`);
    }
    ranges.push({ worktree, base, head });
  }
  return ranges;
}

// Latin-1 maps each byte to one character, so a path keeps its exact bytes.
function gitDiff({ worktree, base, head }, flags) {
  const argv = ["-C", worktree, "diff", ...flags, base, head, "--"];
  const run = spawnSync("git", argv, { maxBuffer: MAX_BUFFER_BYTES });
  if (run.error?.code === "ENOENT") throw new Fault("git not found on PATH");
  if (run.error?.code === "ENOBUFS") {
    throw new Fault(`git diff output in ${worktree} exceeds the 64 MiB buffer`);
  }
  if (run.error) throw new Fault(`cannot run git in ${worktree}: ${run.error.message}`);
  if (run.status !== 0) {
    const firstLine = run.stderr.toString("utf8").split("\n").find((line) => line.trim() !== "");
    throw new Fault(`git diff failed in ${worktree}: ${firstLine ?? `exit status ${run.status ?? run.signal}`}`);
  }
  return run.stdout.toString("latin1");
}

// `<added>\t<deleted>\t<path>\0`, or `<added>\t<deleted>\t\0<old>\0<new>\0` for a rename or copy.
function parseNumstat(output) {
  const fields = output.split("\0");
  const entries = [];
  for (let i = 0; i < fields.length - 1; ) {
    const record = fields[i];
    const addedEnd = record.indexOf("\t");
    const deletedEnd = record.indexOf("\t", addedEnd + 1);
    const added = record.slice(0, addedEnd);
    const deleted = record.slice(addedEnd + 1, deletedEnd);
    const isBinary = added === "-";
    entries.push({ lines: isBinary ? 0 : Number(added) + Number(deleted) });
    i += record.slice(deletedEnd + 1) === "" ? 3 : 1;
  }
  return entries;
}

// `<status>\0<path>\0`, or `<R|C><score>\0<old>\0<new>\0`.
function parseNameStatus(output) {
  const fields = output.split("\0");
  const entries = [];
  for (let i = 0; i < fields.length - 1; ) {
    const status = fields[i];
    const pathCount = status.startsWith("R") || status.startsWith("C") ? 2 : 1;
    entries.push({ status, paths: fields.slice(i + 1, i + 1 + pathCount) });
    i += 1 + pathCount;
  }
  return entries;
}

function areaOf(path) {
  const directories = path.split("/").slice(0, -1);
  return directories.length === 0 ? "." : directories.slice(0, 2).join("/");
}

function pathTokens(path) {
  return path
    .split(/[^A-Za-z0-9]+/)
    .flatMap((word) => word.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(" "))
    .map((token) => token.toLowerCase());
}

function isSensitive(path) {
  return pathTokens(path).some(
    (token) => SENSITIVE_TERMS.has(token) || (token.endsWith("s") && SENSITIVE_TERMS.has(token.slice(0, -1))),
  );
}

function isConfig(path) {
  return path.split("/")[0].startsWith(".");
}

function isRemoval(status) {
  return status.startsWith("D") || status.startsWith("R");
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

// Each range is { numstat: [{ lines }], nameStatus: [{ status, paths }] }.
function profileOf(ranges) {
  const lines = sum(ranges.flatMap((range) => range.numstat.map((entry) => entry.lines)));
  const files = sum(ranges.map((range) => range.numstat.length));
  const areas = sum(ranges.map((range) => new Set(range.nameStatus.flatMap((entry) => entry.paths).map(areaOf)).size));
  const entries = ranges.flatMap((range) => range.nameStatus);
  const paths = entries.flatMap((entry) => entry.paths);
  const matched = {
    config: paths.some(isConfig),
    "multi-repo": ranges.length > 1,
    removal: entries.some((entry) => isRemoval(entry.status)),
    "sensitive-path": paths.some(isSensitive),
  };
  const risk = RISK_ORDER.filter((riskClass) => matched[riskClass]);
  const baseDepth = lines <= LIGHT_MAX_LINES && files <= LIGHT_MAX_FILES ? "light" : "standard";
  const depth = baseDepth === "light" && risk.length > 0 ? "standard" : baseDepth;
  return { depth, baseDepth, lines, files, areas, risk };
}

function formatProfile({ depth, baseDepth, lines, files, areas, risk }) {
  return [
    `depth=${depth}`,
    `base_depth=${baseDepth}`,
    `lines=${lines}`,
    `files=${files}`,
    `areas=${areas}`,
    `risk=${risk.length === 0 ? "none" : risk.join(",")}`,
  ].join("\n") + "\n";
}

function main(args) {
  const ranges = parseRanges(args).map((range) => ({
    numstat: parseNumstat(gitDiff(range, ["--numstat", "-z", "--find-renames", "--no-ext-diff", "--no-textconv"])),
    nameStatus: parseNameStatus(gitDiff(range, ["--name-status", "-z", "--find-renames", "--no-ext-diff"])),
  }));
  process.stdout.write(formatProfile(profileOf(ranges)));
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof Fault)) throw error;
    process.stderr.write(`${SCRIPT}: ${error.message}\n`);
    process.exitCode = 2;
  }
}
