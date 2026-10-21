#!/usr/bin/env node
// Appends one reviewer's `### Cross-model disposition` section to
// docs/plans/<id>/cross-model-notes.md as a blockquoted block, creating the
// file with its frontmatter on first use.
//
// Usage: append-cross-model-notes.mjs --dir <docs/plans/id> --section <file> [--date YYYY-MM-DD]
//
//   --dir      the artifact directory; topic is read from its artifacts
//   --section  the section, saved verbatim, starting at its heading line
//   --date     the frontmatter date on creation; defaults to today (local time)
//
// Every section line is prefixed with `>`, so embedded content cannot leave
// the blockquote. A section whose body begins `Not run:` records no pass and
// appends nothing. Each run appends a new block; a repeated round appears twice.
// The CLI writes REVIEW's unlabeled blocks; record-design-review.mjs imports
// quoteSection and appendNotes for its `**Design round <n>**` blocks.
//
// Prints one line: `appended <path>` or `skipped (not run)`.
// Exit codes:
//   0  appended, or skipped because the pass did not run
//   1  a missing directory, section, or topic; or a section without its heading
//   2  usage error
import { appendFileSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseFlags, readInput, readTopic, requireFlags, resolveDate, runCli } from "./artifact-frontmatter.mjs";

const SCRIPT = "append-cross-model-notes.mjs";
const USAGE =
  "usage: append-cross-model-notes.mjs --dir <docs/plans/id> --section <file> [--date YYYY-MM-DD]";
const HEADING = /^### Cross-model disposition[ \t]*$/;
const NOT_RUN = "Not run:";

function trimBlank(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(start, end);
}

// Returns null for a section that records no pass.
export function quoteSection(section, designRound) {
  const lines = trimBlank(section.split("\n"));
  if (lines.length === 0 || !HEADING.test(lines[0])) {
    throw new Error("the section must start with the line `### Cross-model disposition`");
  }
  const body = trimBlank(lines.slice(1));
  if (body.length > 0 && body[0].trimStart().startsWith(NOT_RUN)) return null;
  const label = designRound === undefined ? [] : [`**Design round ${designRound}**`, ""];
  return [...label, ...lines].map((line) => (line === "" ? ">" : `> ${line}`)).join("\n");
}

export function notesFrontmatter(topic, date) {
  return `---\ntopic: ${topic}\ndate: ${date}\nphase: cross-model-review\n---\n`;
}

// Creates the file with its frontmatter, or separates the block from the last one by a blank line.
export function appendNotes(dir, block, topic, date) {
  const path = join(dir, "cross-model-notes.md");
  if (!existsSync(path)) {
    appendFileSync(path, `${notesFrontmatter(topic, date)}${block}\n`);
    return path;
  }
  const prefix = readFileSync(path, "utf8").endsWith("\n") ? "\n" : "\n\n";
  appendFileSync(path, `${prefix}${block}\n`);
  return path;
}

function main(argv) {
  const flags = parseFlags(argv, ["--dir", "--section", "--date"]);
  requireFlags(flags, ["--dir", "--section"]);
  const date = resolveDate(flags["--date"]);
  const dir = flags["--dir"];
  const topic = readTopic(dir);
  const block = quoteSection(readInput(flags["--section"], "section"));
  if (block === null) {
    process.stdout.write("skipped (not run)\n");
    return;
  }
  const path = appendNotes(dir, block, topic, date);
  process.stdout.write(`appended ${path}\n`);
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli(SCRIPT, USAGE, () => main(process.argv.slice(2)));
}
