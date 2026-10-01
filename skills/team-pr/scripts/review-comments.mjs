#!/usr/bin/env node
// Builds the PR comment bodies that /team-pr posts for deferred findings and
// cross-model-notes.md, and prints which bodies to post. No network, no `gh`.
// Usage: review-comments.mjs --out <dir> --existing <file> [--findings <file>] [--notes <file>]
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REVIEW_NOTES_KEY = "review-notes";
const REVIEW_NOTES_HEADING = "## Review notes";
const NOTES_TAG_LINE = "Cross-model dispositions with no design-round label, from `cross-model-notes`:";
const USAGE = "usage: review-comments.mjs --out <dir> --existing <file> [--findings <file>] [--notes <file>]";

const markerLine = (key) => `<!-- team:pr-comment ${key} -->`;
const isBlank = (line) => line.trim() === "";

function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && isBlank(lines[start])) start += 1;
  while (end > start && isBlank(lines[end - 1])) end -= 1;
  return lines.slice(start, end);
}

function notesBodyLines(notesText) {
  const lines = notesText.split("\n");
  const closing = lines.indexOf("---", 1);
  return lines.slice(closing + 1);
}

function reviewNotesBody(findingsLines, unlabeledParts) {
  const sections = [REVIEW_NOTES_HEADING];
  if (findingsLines.length > 0) sections.push(findingsLines.join("\n"));
  if (unlabeledParts.length > 0) sections.push(NOTES_TAG_LINE, ...unlabeledParts);
  return `${markerLine(REVIEW_NOTES_KEY)}\n\n${sections.join("\n\n")}\n`;
}

function buildComments(findingsText, notesText) {
  const findingsLines = trimBlankLines(findingsText.split("\n"));
  const notesLines = notesText === undefined ? [] : trimBlankLines(notesBodyLines(notesText));
  const unlabeledParts = notesLines.length > 0 ? [notesLines.join("\n")] : [];
  if (findingsLines.length === 0 && unlabeledParts.length === 0) return [];
  return [{ key: REVIEW_NOTES_KEY, body: reviewNotesBody(findingsLines, unlabeledParts) }];
}

function readOptional(path) {
  if (path === undefined) return undefined;
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

function main(argv) {
  const flag = (name) => {
    const at = argv.indexOf(name);
    if (at < 0) return undefined;
    const value = argv[at + 1];
    return value === undefined || value.startsWith("--") ? null : value;
  };
  const fail = (message) => {
    process.stderr.write(`review-comments.mjs: ${message}\n`);
    process.exit(2);
  };

  const out = flag("--out");
  const existingPath = flag("--existing");
  const findingsPath = flag("--findings");
  const notesPath = flag("--notes");
  if (!out || !existingPath || findingsPath === null || notesPath === null) fail(USAGE);

  JSON.parse(readFileSync(existingPath, "utf8"));
  const comments = buildComments(readOptional(findingsPath) ?? "", readOptional(notesPath));

  const post = comments.map(({ key, body }) => {
    const file = join(out, `${key}.md`);
    writeFileSync(file, body);
    return { key, file, characters: body.length };
  });
  process.stdout.write(`${JSON.stringify({ post, skip: [], refused: [] })}\n`);
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2));
}
