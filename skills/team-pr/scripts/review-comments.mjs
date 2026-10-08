#!/usr/bin/env node
// Builds the PR comment bodies that /team-pr posts for deferred findings and
// cross-model-notes.md, plus Team's code review body, and prints which bodies to post.
// No network, no `gh`.
// Usage: review-comments.mjs --out <dir> --existing <file> [--findings <file>] [--notes <file>]
//   [--verdict approve|comment|request-changes --reviewed <sha> --viewer <file> --review-findings <file>]
import { readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REVIEW_NOTES_KEY = "review-notes";
const REVIEW_NOTES_HEADING = "## Review notes";
const NOTES_TAG_LINE = "Cross-model dispositions with no design-round label, from `cross-model-notes`:";
const USAGE =
  "usage: review-comments.mjs --out <dir> --existing <file> [--findings <file>] [--notes <file>]" +
  " [--verdict approve|comment|request-changes --reviewed <sha> --viewer <file> --review-findings <file>]";
// GitHub rejects a comment body over 65536 characters. The code review assumes the same limit.
const BODY_LIMIT = 65536;

const VERDICT_WORDS = new Map([
  ["approve", "APPROVE"],
  ["comment", "COMMENT"],
  ["request-changes", "REQUEST CHANGES"],
]);
const REVIEWED_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const NO_FINDINGS_LINE = "No findings.";

const DISPOSITION_HEADING = /^>\s*### Cross-model disposition\s*$/;
const DESIGN_ROUND_LABEL = /^>\s*\*\*Design round (\d+)\*\*\s*$/;
const BLANK_QUOTE = /^>\s*$/;

const markerLine = (key) => `<!-- team:pr-comment ${key} -->`;
const reviewMarkerLine = (key) => `<!-- team:pr-review ${key} -->`;
const designRoundKey = (round) => `design-round-${round}`;
const codeReviewKey = (reviewed) => `code-review-${reviewed}`;
const verdictLine = (verdict) => `**Verdict: ${VERDICT_WORDS.get(verdict)}**`;
const commitLine = (reviewed) => `Reviewed commit: \`${reviewed}\``;
const isBlank = (line) => line.trim() === "";
const firstLine = (body) => body.split("\n")[0].replace(/\r$/, "");
const sameLogin = (left, right) => left.toLowerCase() === right.toLowerCase();

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
  if (lines[0] !== "---" || closing < 0) return { error: "the notes file has no frontmatter" };
  return { lines: lines.slice(closing + 1) };
}

function reviewNotesBody(findingsLines, unlabeledParts) {
  const sections = [REVIEW_NOTES_HEADING];
  if (findingsLines.length > 0) sections.push(findingsLines.join("\n"));
  if (unlabeledParts.length > 0) sections.push(NOTES_TAG_LINE, ...unlabeledParts);
  return `${markerLine(REVIEW_NOTES_KEY)}\n\n${sections.join("\n\n")}\n`;
}

// A design-round label claims the heading below it only when blank quote lines
// alone separate them, so a label inside another block's content stays there.
function blockStart(lines, headingIndex) {
  let above = headingIndex - 1;
  while (above >= 0 && BLANK_QUOTE.test(lines[above])) above -= 1;
  const label = above >= 0 ? lines[above].match(DESIGN_ROUND_LABEL) : null;
  return label ? { index: above, round: Number(label[1]) } : { index: headingIndex, round: null };
}

function splitNotes(lines) {
  const starts = lines.flatMap((line, index) => (DISPOSITION_HEADING.test(line) ? [blockStart(lines, index)] : []));
  const preamble = trimBlankLines(lines.slice(0, starts.length > 0 ? starts[0].index : lines.length));
  const blocks = starts.map((start, position) => ({
    round: start.round,
    text: trimBlankLines(lines.slice(start.index, starts[position + 1]?.index ?? lines.length)).join("\n"),
  }));
  return { preamble: preamble.join("\n"), blocks };
}

function designRoundComments(blocks) {
  const byRound = new Map();
  for (const block of blocks.filter((candidate) => candidate.round !== null)) {
    byRound.set(block.round, [...(byRound.get(block.round) ?? []), block.text]);
  }
  return [...byRound.keys()]
    .sort((left, right) => left - right)
    .map((round) => {
      const key = designRoundKey(round);
      return { key, body: `${markerLine(key)}\n\n${byRound.get(round).join("\n\n")}\n` };
    });
}

function buildComments(findingsText, notesLines) {
  const findingsLines = trimBlankLines(findingsText.split("\n"));
  const { preamble, blocks } = splitNotes(notesLines);
  const unlabeledParts = [preamble, ...blocks.filter((block) => block.round === null).map((block) => block.text)].filter(
    (part) => part !== "",
  );
  const reviewNotes =
    findingsLines.length === 0 && unlabeledParts.length === 0
      ? []
      : [{ key: REVIEW_NOTES_KEY, body: reviewNotesBody(findingsLines, unlabeledParts) }];
  return [...reviewNotes, ...designRoundComments(blocks)];
}

function partitionBySize(comments) {
  const post = comments.filter(({ body }) => body.length <= BODY_LIMIT);
  const refused = comments
    .filter(({ body }) => body.length > BODY_LIMIT)
    .map(({ key, body }) => ({ key, reason: `the body is ${body.length} characters, over the ${BODY_LIMIT}-character limit` }));
  return { post, refused };
}

// A comment with no author flag cannot be told apart from the viewer's own,
// and treating it as someone else's would post a duplicate.
function viewerMarkerLines(existing) {
  if (!Array.isArray(existing?.comments)) return { error: "the existing-comments file has no comments array" };
  const invalid = existing.comments.findIndex(
    (comment) => typeof comment?.body !== "string" || typeof comment?.viewerDidAuthor !== "boolean",
  );
  if (invalid >= 0) {
    return { error: `existing comment ${invalid} needs a string body and a boolean viewerDidAuthor` };
  }
  return {
    lines: new Set(existing.comments.filter((comment) => comment.viewerDidAuthor).map((comment) => firstLine(comment.body))),
  };
}

function partitionByPosted(comments, postedMarkerLines) {
  const isPosted = ({ key }) => postedMarkerLines.has(markerLine(key));
  return {
    pending: comments.filter((comment) => !isPosted(comment)),
    skip: comments.filter(isPosted).map(({ key }) => ({ key })),
  };
}

function viewerLogin(viewer) {
  if (viewer.error) return { error: `cannot read the viewer file: ${viewer.error}` };
  let parsed;
  try {
    parsed = JSON.parse(viewer.text);
  } catch (error) {
    return { error: `the viewer file is not JSON: ${error.message}` };
  }
  return typeof parsed?.login === "string" ? { login: parsed.login } : { error: "the viewer file has no string login" };
}

// A deleted account leaves a review with a null author, which is never the viewer's.
function viewerPostedReview(reviews, login, marker) {
  return reviews.some(
    (review) =>
      typeof review?.author?.login === "string" &&
      sameLogin(review.author.login, login) &&
      typeof review.body === "string" &&
      firstLine(review.body) === marker,
  );
}

function codeReviewBody(key, verdict, reviewed, findingsText) {
  const findings = trimBlankLines(findingsText.split("\n"));
  const summary = [verdictLine(verdict), commitLine(reviewed)].join("\n");
  const findingsPart = findings.length > 0 ? findings.join("\n") : NO_FINDINGS_LINE;
  return `${reviewMarkerLine(key)}\n\n${summary}\n\n${findingsPart}\n`;
}

// A fault in a review-only input refuses the review and never stops the comments.
function codeReviewEntry({ existing, viewer, reviewFindings, verdict, reviewed }) {
  const key = codeReviewKey(reviewed);
  const refuse = (reason) => ({ refused: { key, reason } });
  if (!Array.isArray(existing.reviews)) return refuse("the existing-comments file has no reviews array");
  const login = viewerLogin(viewer);
  if (login.error) return refuse(login.error);
  if (reviewFindings.error) return refuse(`cannot read the review-findings file: ${reviewFindings.error}`);
  if (viewerPostedReview(existing.reviews, login.login, reviewMarkerLine(key))) return { skip: { key } };
  return { pending: { key, body: codeReviewBody(key, verdict, reviewed, reviewFindings.text), verdict } };
}

function readReviewInput(path) {
  try {
    return { text: readFileSync(path, "utf8") };
  } catch (error) {
    return { error: error.message };
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

  const verdict = flag("--verdict");
  const reviewed = flag("--reviewed");
  const viewerPath = flag("--viewer");
  const reviewFindingsPath = flag("--review-findings");
  if (verdict === undefined) {
    if ([reviewed, viewerPath, reviewFindingsPath].some((value) => value !== undefined)) fail(USAGE);
  } else {
    if (!VERDICT_WORDS.has(verdict)) fail(`--verdict must be one of ${[...VERDICT_WORDS.keys()].join(", ")}`);
    if (typeof reviewed !== "string" || !REVIEWED_COMMIT.test(reviewed)) {
      fail("--reviewed must be 40 or 64 lowercase hex characters");
    }
    if (!viewerPath || !reviewFindingsPath) fail(USAGE);
  }

  // Every check runs before the first write, so an exit 2 leaves --out empty
  // and a stale body from an earlier run can never be posted.
  let outEntries;
  try {
    outEntries = readdirSync(out);
  } catch (error) {
    fail(`cannot use --out "${out}": ${error.message}`);
  }
  if (outEntries.length > 0) fail(`--out "${out}" is not empty`);

  const readOptional = (path, label) => {
    if (path === undefined) return undefined;
    try {
      return readFileSync(path, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return undefined;
      return fail(`cannot read the ${label} at "${path}": ${error.message}`);
    }
  };

  let existing;
  try {
    existing = JSON.parse(readFileSync(existingPath, "utf8"));
  } catch (error) {
    fail(`cannot read the existing-comments file at "${existingPath}": ${error.message}`);
  }
  const posted = viewerMarkerLines(existing);
  if (posted.error) fail(posted.error);

  const findingsText = readOptional(findingsPath, "findings file") ?? "";
  const notesText = readOptional(notesPath, "notes file");
  const notes = notesText === undefined ? { lines: [] } : notesBodyLines(notesText);
  if (notes.error) fail(notes.error);

  const comments = buildComments(findingsText, notes.lines);
  const { pending, skip } = partitionByPosted(comments, posted.lines);
  const review =
    verdict === undefined
      ? {}
      : codeReviewEntry({
          existing,
          viewer: readReviewInput(viewerPath),
          reviewFindings: readReviewInput(reviewFindingsPath),
          verdict,
          reviewed,
        });
  const { post, refused } = partitionBySize(review.pending ? [...pending, review.pending] : pending);

  const written = post.map(({ key, body, ...fields }) => {
    const file = join(out, `${key}.md`);
    writeFileSync(file, body);
    return { key, file, characters: body.length, ...fields };
  });
  const manifest = {
    post: written,
    skip: review.skip ? [...skip, review.skip] : skip,
    refused: review.refused ? [...refused, review.refused] : refused,
  };
  process.stdout.write(`${JSON.stringify(manifest)}\n`);
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2));
}
