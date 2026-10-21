#!/usr/bin/env node
// Lists the commits a CHANGELOG.md update must consider, each with the
// conventional-commit filter's default verdict. Reads git; writes nothing.
//
// Usage: changelog-candidates.mjs <repo-dir>
//
// Baseline: the first `## [X.Y.Z] - YYYY-MM-DD` heading below `## [Unreleased]`,
// resolved to a commit by tag `vX.Y.Z`, then tag `X.Y.Z`, then the newest commit
// on HEAD whose subject names the version. With no versioned heading, every
// commit on HEAD is a candidate.
//
// Output: one JSON object on stdout:
//   {"changelog": "<path>",
//    "baseline": {"version", "commit", "via": "tag"|"subject"} | null,
//    "range": "<commit>..HEAD" | "HEAD",
//    "commits": [{"hash", "subject", "type", "breaking", "rule", "reason"}]}
// `commits` is newest first. `type` is the lowercased conventional type, or
// null. `rule` is "include", "exclude", or "review"; `reason` names what decided
// it: "merge", "fixup", "wip", "breaking", the type, "no-type", or "unknown-type".
//
// Exit codes:
//   0  listed; an empty `commits` means nothing to add
//   1  <repo-dir>/CHANGELOG.md does not exist; nothing listed
//   2  fault: usage, a git failure, or a versioned heading no commit resolves
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const USAGE = "usage: changelog-candidates.mjs <repo-dir>";

// The changelog reference's include and exclude type lists, verbatim.
const INCLUDE_TYPES = new Set(["feat", "fix", "perf", "security"]);
const EXCLUDE_TYPES = new Set(["chore", "test", "refactor", "docs", "ci", "revert"]);

const UNRELEASED_HEADING = /^## \[Unreleased\]\s*$/i;
const VERSION_HEADING = /^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\] - \d{4}-\d{2}-\d{2}\s*$/;
const CONVENTIONAL = /^([A-Za-z]+)(?:\([^)]*\))?(!)?: /;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: /m;
const FIXUP = /^(fixup|squash|amend)! /;
const WIP = /^wip\b/i;

// NUL ends a field and RS ends a record: git messages carry neither.
const FIELD = "\x00";
const RECORD = "\x1e";

function fail(message) {
  process.stderr.write(`changelog-candidates.mjs: ${message}\n`);
  process.exit(2);
}

// The first versioned heading below `## [Unreleased]`, or from the top when that
// heading is absent.
export function baselineVersion(changelogText) {
  const lines = changelogText.split(/\r?\n/);
  const unreleased = lines.findIndex((line) => UNRELEASED_HEADING.test(line));
  for (const line of lines.slice(unreleased + 1)) {
    const match = VERSION_HEADING.exec(line);
    if (match) return match[1];
  }
  return null;
}

// True when `subject` names `version` whole, never as part of a longer version.
export function subjectNamesVersion(subject, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^0-9.])${escaped}($|[^0-9.]|\\.($|[^0-9]))`).test(subject);
}

export function classify({ parents, subject, body }) {
  const conventional = CONVENTIONAL.exec(subject);
  const type = conventional ? conventional[1].toLowerCase() : null;
  const breaking = Boolean(conventional?.[2]) || BREAKING_FOOTER.test(body);
  const verdict = (rule, reason) => ({ type, breaking, rule, reason });
  if (parents > 1) return verdict("exclude", "merge");
  if (FIXUP.test(subject)) return verdict("exclude", "fixup");
  if (WIP.test(subject)) return verdict("exclude", "wip");
  if (breaking) return verdict("include", "breaking");
  if (INCLUDE_TYPES.has(type)) return verdict("include", type);
  if (EXCLUDE_TYPES.has(type)) return verdict("exclude", type);
  return verdict("review", type === null ? "no-type" : "unknown-type");
}

export function parseLog(output) {
  return output
    .split(RECORD)
    .map((record) => record.replace(/^\n/, ""))
    .filter((record) => record !== "")
    .map((record) => {
      const [hash, parentList, subject, body = ""] = record.split(FIELD);
      const parents = parentList.trim() === "" ? 0 : parentList.trim().split(" ").length;
      return { hash, subject, ...classify({ parents, subject, body }) };
    });
}

function git(repoDir, args) {
  try {
    return execFileSync("git", ["-C", repoDir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if (error.code === "ENOENT") fail("git is not on PATH");
    fail(`git ${args.join(" ")} failed: ${String(error.stderr || error.message).trim()}`);
  }
}

function tagCommit(repoDir, tag) {
  try {
    const args = ["-C", repoDir, "rev-parse", "-q", "--verify", `refs/tags/${tag}^{commit}`];
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function resolveBaseline(repoDir, version) {
  for (const tag of [`v${version}`, version]) {
    const commit = tagCommit(repoDir, tag);
    if (commit) return { version, commit, via: "tag" };
  }
  const subjects = git(repoDir, ["log", "--format=%H%x00%s", "HEAD"]);
  for (const line of subjects.split("\n")) {
    const [commit, subject = ""] = line.split(FIELD);
    if (commit && subjectNamesVersion(subject, version)) return { version, commit, via: "subject" };
  }
  fail(`CHANGELOG.md names ${version}, but no tag and no commit subject on HEAD names it`);
}

function main(argv) {
  if (argv.length !== 1 || argv[0] === "" || argv[0].startsWith("-")) fail(USAGE);
  const repoDir = argv[0];
  if (!existsSync(repoDir) || !statSync(repoDir).isDirectory()) fail(`not a directory: ${repoDir}`);
  const changelog = join(repoDir, "CHANGELOG.md");
  if (!existsSync(changelog)) {
    process.stderr.write(`changelog-candidates.mjs: no CHANGELOG.md in ${repoDir}\n`);
    process.exit(1);
  }
  git(repoDir, ["rev-parse", "--verify", "-q", "HEAD^{commit}"]);
  const version = baselineVersion(readFileSync(changelog, "utf8"));
  const baseline = version === null ? null : resolveBaseline(repoDir, version);
  const range = baseline === null ? "HEAD" : `${baseline.commit}..HEAD`;
  const log = git(repoDir, ["log", "--format=%H%x00%P%x00%s%x00%b%x1e", range]);
  process.stdout.write(`${JSON.stringify({ changelog, baseline, range, commits: parseLog(log) })}\n`);
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2));
}
