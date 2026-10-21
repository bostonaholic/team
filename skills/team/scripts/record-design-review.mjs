#!/usr/bin/env node
// Records one design-review round: writes docs/plans/<id>/design-review-<n>.md
// with the verdict derived from the report and the report body verbatim.
//
// Usage: record-design-review.mjs --dir <docs/plans/id> --report <file> [--date YYYY-MM-DD]
//
//   --dir     the artifact directory; topic is read from its artifacts
//   --report  the reviewer's report, saved verbatim
//   --date    the frontmatter date; defaults to today (local time)
//
// <n> is the highest existing design-review-<n>.md plus one, or 1. The verdict
// is the last verdict token (APPROVE, REQUEST CHANGES, COMMENT) in the report,
// so a verdict word quoted earlier never becomes the recorded verdict. Each
// run records a new round; it never overwrites an earlier one.
//
// Prints one JSON line: {"path":"…","round":<n>,"verdict":"…","passed":<bool>}
// Exit codes:
//   0  recorded
//   1  a missing directory, report, or topic
//   2  usage error
//   3  the report carries no verdict token; nothing written
import { readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseFlags, readInput, readTopic, requireFlags, resolveDate, runCli } from "./artifact-frontmatter.mjs";

const SCRIPT = "record-design-review.mjs";
const USAGE = "usage: record-design-review.mjs --dir <docs/plans/id> --report <file> [--date YYYY-MM-DD]";
const VERDICT_TOKEN = /\b(REQUEST CHANGES|APPROVE|COMMENT)\b/g;
// The two verdicts the design-review gate advances on.
const PASSING = new Set(["APPROVE", "COMMENT"]);
const ROUND_FILE = /^design-review-(\d+)\.md$/;

export function lastVerdict(report) {
  const tokens = [...report.matchAll(VERDICT_TOKEN)];
  return tokens.length === 0 ? null : tokens[tokens.length - 1][1];
}

export function nextRound(names) {
  const rounds = names.map((name) => name.match(ROUND_FILE)).filter(Boolean).map((match) => Number(match[1]));
  return Math.max(0, ...rounds) + 1;
}

export function renderReview({ topic, date, verdict, report }) {
  return `---\ntopic: ${topic}\ndate: ${date}\nphase: design-review\nverdict: ${verdict}\n---\n${report}`;
}

function main(argv) {
  const flags = parseFlags(argv, ["--dir", "--report", "--date"]);
  requireFlags(flags, ["--dir", "--report"]);
  const date = resolveDate(flags["--date"]);
  const dir = flags["--dir"];
  const report = readInput(flags["--report"], "report");
  const topic = readTopic(dir);
  const verdict = lastVerdict(report);
  if (verdict === null) {
    process.stderr.write(`${SCRIPT}: the report carries no verdict token (APPROVE, REQUEST CHANGES, COMMENT)\n`);
    process.exit(3);
  }
  const round = nextRound(readdirSync(dir));
  const path = join(dir, `design-review-${round}.md`);
  writeFileSync(path, renderReview({ topic, date, verdict, report }), { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ path, round, verdict, passed: PASSING.has(verdict) })}\n`);
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli(SCRIPT, USAGE, () => main(process.argv.slice(2)));
}
