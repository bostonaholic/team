#!/usr/bin/env node
// Records one design-review round: appends the report's cross-model
// disposition to docs/plans/<id>/cross-model-notes.md, then writes
// docs/plans/<id>/design-review-<n>.md with the verdict derived from the
// report and the report body verbatim.
//
// Usage: record-design-review.mjs --dir <docs/plans/id> --report <file> [--date YYYY-MM-DD]
//
//   --dir     the artifact directory; topic is copied from its 6-design.md
//   --report  the reviewer's report, saved verbatim
//   --date    the frontmatter date; defaults to today (local time)
//
// <n> is the highest existing design-review-<n>.md plus one, or 1. The verdict
// is the last verdict token (APPROVE, REQUEST CHANGES, COMMENT) in the report,
// so a verdict word quoted earlier never becomes the recorded verdict. Each
// run records a new round; it never overwrites an earlier one.
//
// The disposition is the `### Cross-model disposition` section: its heading
// through the line before the next level 1-3 heading or the verdict line. It
// is appended as a `**Design round <n>**` block, unless its body begins
// `Not run:`. The notes go first, so a crash before the round file is written
// leaves a rerun to record the round, with a duplicate-labeled block at most.
//
// Prints one JSON line:
//   {"path":"…","round":<n>,"verdict":"…","passed":<bool>,"crossModelNotes":"appended"|"not run"|"none"}
// Exit codes:
//   0  recorded
//   1  a missing directory, report, 6-design.md, or topic
//   2  usage error
//   3  the report carries no verdict token; nothing written
import { existsSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { appendNotes, quoteSection } from "./append-cross-model-notes.mjs";
import { parseFlags, readInput, readTopic, requireFlags, resolveDate, runCli } from "./artifact-frontmatter.mjs";

const SCRIPT = "record-design-review.mjs";
const USAGE = "usage: record-design-review.mjs --dir <docs/plans/id> --report <file> [--date YYYY-MM-DD]";
const DESIGN = "6-design.md";
// The design reviewer's verdict set (skills/team/references/design-reviewer.md).
const VERDICT_TOKEN = /\b(REQUEST[ \t]+CHANGES|APPROVE|COMMENT)\b/g;
// The two verdicts the design-review gate advances on.
const PASSING = new Set(["APPROVE", "COMMENT"]);
const ROUND_FILE = /^design-review-(\d+)\.md$/;
const DISPOSITION_HEADING = "### Cross-model disposition";
// A level 1-3 heading closes the disposition section; its per-CLI subsections sit deeper.
const SECTION_END = /^#{1,3}\s/;

// Returns { verdict, line } for the last token, or null.
export function lastVerdict(report) {
  const lines = report.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const tokens = [...lines[index].matchAll(VERDICT_TOKEN)];
    if (tokens.length > 0) return { verdict: tokens[tokens.length - 1][1].replace(/[ \t]+/, " "), line: index };
  }
  return null;
}

export function nextRound(names) {
  const rounds = names.map((name) => name.match(ROUND_FILE)).filter(Boolean).map((match) => Number(match[1]));
  return Math.max(0, ...rounds) + 1;
}

// The section text, or null when the report has none.
export function dispositionSection(report, verdictLine) {
  const lines = report.split("\n");
  const start = lines.findIndex((line) => line.trim() === DISPOSITION_HEADING);
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && end !== verdictLine && !SECTION_END.test(lines[end])) end += 1;
  return lines.slice(start, end).join("\n");
}

export function renderReview({ topic, date, verdict, report }) {
  return `---\ntopic: ${topic}\ndate: ${date}\nphase: design-review\nverdict: ${verdict}\n---\n${report}`;
}

function designTopic(dir) {
  if (!existsSync(dir)) throw new Error(`artifact directory not found: ${dir}`);
  if (!existsSync(join(dir, DESIGN))) throw new Error(`missing ${join(dir, DESIGN)}`);
  return readTopic(dir, [DESIGN]);
}

function main(argv) {
  const flags = parseFlags(argv, ["--dir", "--report", "--date"]);
  requireFlags(flags, ["--dir", "--report"]);
  const date = resolveDate(flags["--date"]);
  const dir = flags["--dir"];
  const report = readInput(flags["--report"], "report");
  const topic = designTopic(dir);
  const parsed = lastVerdict(report);
  if (parsed === null) {
    process.stderr.write(`${SCRIPT}: the report carries no verdict token (APPROVE, REQUEST CHANGES, COMMENT)\n`);
    process.exit(3);
  }
  const round = nextRound(readdirSync(dir));
  const section = dispositionSection(report, parsed.line);
  const block = section === null ? null : quoteSection(section, round);
  if (block !== null) appendNotes(dir, block, topic, date);
  const path = join(dir, `design-review-${round}.md`);
  writeFileSync(path, renderReview({ topic, date, verdict: parsed.verdict, report }), { flag: "wx" });
  const crossModelNotes = section === null ? "none" : block === null ? "not run" : "appended";
  process.stdout.write(`${JSON.stringify({ path, round, verdict: parsed.verdict, passed: PASSING.has(parsed.verdict), crossModelNotes })}\n`);
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli(SCRIPT, USAGE, () => main(process.argv.slice(2)));
}
