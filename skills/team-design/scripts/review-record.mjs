#!/usr/bin/env node
// Reads and writes the design-review round records under docs/plans/<id>/.
//
// Usage:
//   review-record.mjs status <plan-dir>
//   review-record.mjs record <plan-dir> <report-file> [--date YYYY-MM-DD]
//
// status prints one line:
//   passed <n>    the highest design-review-<n>.md carries verdict APPROVE or COMMENT
//   pending <n>   no passing record; <n> is the round number to review next
//
// record reads the reviewer's report verbatim from <report-file> and prints two lines:
//   round <n>
//   verdict <APPROVE|REQUEST CHANGES|COMMENT>
// The verdict is the last verdict token in the report. When the report holds a
// `### Cross-model disposition` section, the section is appended to
// cross-model-notes.md, blockquote-wrapped under `> **Design round <n>**`, before
// design-review-<n>.md is created. Neither file is ever overwritten; a rerun records
// a new round, as a resumed session repeating a round does.
// --date overrides today's local date in new frontmatter.
//
// Exit codes:
//   0  success
//   1  runtime error: plan dir, report file, or 6-design.md topic missing, or a write failed
//   2  usage error
//   3  the report carries no verdict token; nothing was written
import { appendFileSync, existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const USAGE = "usage: review-record.mjs status <plan-dir> | record <plan-dir> <report-file> [--date YYYY-MM-DD]";
const RECORD_NAME = /^design-review-(\d+)\.md$/;
// The design reviewer's verdict set (skills/team/references/design-reviewer.md).
const VERDICT_TOKEN = /\b(APPROVE|REQUEST[ \t]+CHANGES|COMMENT)\b/g;
const PASSING = new Set(["APPROVE", "COMMENT"]);
const DISPOSITION_HEADING = "### Cross-model disposition";
// A level 1-3 heading closes the disposition section; its per-CLI subsections sit deeper.
const SECTION_END = /^#{1,3}\s/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Matches discover-topic.sh's frontmatter scan limit, so both read a record alike.
const FRONTMATTER_MAX_LINES = 60;

class Failure extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function frontmatter(text) {
  const lines = text.split("\n");
  if (lines[0] !== "---") return null;
  const closing = lines.indexOf("---", 1);
  if (closing < 0 || closing > FRONTMATTER_MAX_LINES) return null;
  return lines.slice(1, closing);
}

function field(lines, name) {
  const prefix = `${name}:`;
  const line = (lines ?? []).find((entry) => entry.startsWith(prefix));
  return line === undefined ? null : line.slice(prefix.length).trim();
}

function rounds(planDir) {
  return readdirSync(planDir)
    .map((name) => name.match(RECORD_NAME))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
}

export function status(planDir) {
  const numbers = rounds(planDir);
  if (numbers.length === 0) return { state: "pending", round: 1 };
  const latest = numbers[numbers.length - 1];
  const verdict = field(frontmatter(readFileSync(join(planDir, `design-review-${latest}.md`), "utf8")), "verdict");
  return PASSING.has(verdict) ? { state: "passed", round: latest } : { state: "pending", round: latest + 1 };
}

export function lastVerdict(report) {
  const lines = report.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const tokens = [...lines[index].matchAll(VERDICT_TOKEN)];
    if (tokens.length > 0) return { verdict: tokens[tokens.length - 1][1].replace(/\s+/, " "), line: index };
  }
  return null;
}

// The section runs to the next level 1-3 heading and stops before the verdict line.
export function dispositionSection(report, verdictLine) {
  const lines = report.split("\n");
  const start = lines.findIndex((line) => line.trim() === DISPOSITION_HEADING);
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && end !== verdictLine && !SECTION_END.test(lines[end])) end += 1;
  while (end > start + 1 && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(start, end);
}

export function quoteBlock(round, sectionLines) {
  return [`**Design round ${round}**`, "", ...sectionLines]
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");
}

function today() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function designTopic(planDir) {
  const designPath = join(planDir, "6-design.md");
  if (!existsSync(designPath)) throw new Failure(`missing ${designPath}`, 1);
  const topic = field(frontmatter(readFileSync(designPath, "utf8")), "topic");
  if (!topic) throw new Failure(`no topic in ${designPath} frontmatter`, 1);
  return topic;
}

function appendNotes(planDir, block, topic, date) {
  const notesPath = join(planDir, "cross-model-notes.md");
  if (!existsSync(notesPath)) {
    const header = `---\ntopic: ${topic}\ndate: ${date}\nphase: cross-model-review\n---\n`;
    writeFileSync(notesPath, `${header}\n${block}\n`, { flag: "wx" });
    return;
  }
  const existing = readFileSync(notesPath, "utf8");
  appendFileSync(notesPath, `${existing.endsWith("\n") ? "" : "\n"}\n${block}\n`);
}

export function record(planDir, report, date) {
  const parsed = lastVerdict(report);
  if (!parsed) throw new Failure("the report carries no verdict token", 3);
  const topic = designTopic(planDir);
  const current = status(planDir);
  const round = current.state === "passed" ? current.round + 1 : current.round;
  const section = dispositionSection(report, parsed.line);
  if (section) appendNotes(planDir, quoteBlock(round, section), topic, date);
  const header = `---\ntopic: ${topic}\ndate: ${date}\nphase: design-review\nverdict: ${parsed.verdict}\n---\n\n`;
  writeFileSync(join(planDir, `design-review-${round}.md`), header + report, { flag: "wx" });
  return { round, verdict: parsed.verdict };
}

function requireDir(planDir) {
  if (!existsSync(planDir) || !statSync(planDir).isDirectory()) throw new Failure(`not a directory: ${planDir}`, 1);
}

function run(args) {
  const [verb, planDir, ...rest] = args;
  if (verb === "status" && planDir && rest.length === 0) {
    requireDir(planDir);
    const result = status(planDir);
    return `${result.state} ${result.round}\n`;
  }
  if (verb === "record" && planDir && rest.length >= 1) {
    const [reportFile, ...options] = rest;
    let date = today();
    if (options.length === 2 && options[0] === "--date" && DATE.test(options[1])) date = options[1];
    else if (options.length !== 0) throw new Failure(USAGE, 2);
    requireDir(planDir);
    if (!existsSync(reportFile)) throw new Failure(`missing report file: ${reportFile}`, 1);
    const result = record(planDir, readFileSync(reportFile, "utf8"), date);
    return `round ${result.round}\nverdict ${result.verdict}\n`;
  }
  throw new Failure(USAGE, 2);
}

function main(args) {
  try {
    process.stdout.write(run(args));
  } catch (error) {
    process.stderr.write(`review-record.mjs: ${error.message}\n`);
    process.exit(error instanceof Failure ? error.code : 1);
  }
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2));
}
