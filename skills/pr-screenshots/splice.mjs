#!/usr/bin/env node

/**
 * The Screenshots-section body transform, as a pure function.
 *
 *     import { splice, bodyRefusal } from "<skill-dir>/splice.mjs";
 *     const { body, changed, reason } = splice(currentBody, section, { landed });
 *
 *     node "<skill-dir>/splice.mjs" --body-file <path> --section-file <path> \
 *       --landed <count>
 *     node "<skill-dir>/splice.mjs" --check --body-file <path>
 *
 * `f(body, section, options) -> {body, changed, reason}`: no network, no `gh`,
 * no mutation of anything on disk. The document scan, the trailing-block split,
 * and the refusals are neither deterministic nor testable as prose, which is
 * why they are code (docs/testing.md, "L1: Pure unit"). `reason` is non-empty
 * whenever a rule refuses, and empty on a write.
 *
 * `--check` runs `bodyRefusal` alone: every refusal computable from the body
 * by itself, with no section and no counts. It exists so the caller can run
 * those refusals in step A, against the pre-image, BEFORE the first
 * `gh pr edit --attach` — "refuse before mutating, never after"
 * (`SKILL.md`). A refusal discovered only after the attach step leaves live
 * assets on a body this transform then declines to write.
 *
 * ## The model, and why refusing is the default
 *
 * This transform edits a live PR body that may already be merged. A refusal
 * costs an operator one manual edit and leaves the body byte-identical; a
 * wrong transform deletes text nobody can recover. So the scan below models a
 * closed set of markdown constructs — fenced blocks, block-level HTML
 * comments, ATX headings indented up to three spaces, setext headings, ticket
 * references, and standalone INLINE image lines — and **refuses any body
 * carrying a construct outside that set** rather than guessing at its
 * boundaries (`principle-fail-closed`). Raw HTML blocks and every non-inline
 * image form — `<img>`, `<picture>`, `![alt][ref]`, `[ref]: <url>`, a bare
 * auto-embedded URL — are outside the set and fault, because the scan can
 * neither find their boundaries nor count them as images it would delete.
 * Widening the set is a code change with a test; meeting an unmodeled shape at
 * runtime is a refusal with a named reason.
 *
 * The CLI guard at the bottom follows resolve-transcript.mjs and
 * write-target.mjs: it runs only on direct execution, so a test import has no
 * side effects. Exit 0 writes the body on stdout, exit 1 is a clean refusal,
 * and exit 2 is a usage or environment fault — an unreadable input never
 * reaches the caller as a stack trace on the refusal code.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** GitHub's PR-body ceiling, in characters. Rule 5 refuses above it. */
const BODY_LIMIT = 65536;

/**
 * Rule 1's trailing sections: lifted out of `content` with the closing line
 * and re-emitted byte-identical below the spliced section. `## Pre-merge` is
 * one of them, and `## Companion PRs` is the other.
 */
const FOOTER_SECTIONS = ["## Pre-merge", "## Companion PRs"];

/**
 * Rule 2's insertion anchors, exhaustively. The section goes above whichever
 * one appears first in `content`; when none does, it goes at the end of
 * `content`. A trailing section is excluded here, by this list and nothing
 * else, so a body that carries one mid-document is unaffected.
 */
const ANCHORS = ["## How to Verify", "## Review notes", "## References"];

/**
 * A standalone ticket-reference line. All nine of GitHub's closing stems, plus
 * the non-closing `Part of` a companion PR carries and `Ref`/`Refs`. The stems
 * differ in stem rather than case, so case-insensitivity alone would leave six
 * closing forms in `content` where rule 2's replace would delete them. The
 * optional `:` covers the `Fixes: #123` form.
 */
const TICKET_REFERENCE = /^(?:Close[sd]?|Fix(?:es|ed)?|Resolve[sd]?|Part of|Refs?):?\s+\S/i;

/** The heading this skill owns, by title. */
const SCREENSHOTS_TITLE = "Screenshots";

/**
 * An ATX heading: up to three spaces of indentation, one to six `#`, then
 * whitespace or end of line (CommonMark 0.31.2 §4.2). The indentation bound is
 * the spec's, not column zero: `   ## Test plan` is a heading, and a replace
 * that reads it as body text runs straight through the section it opens.
 */
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;

/** An ATX heading's optional closing sequence, which is not part of its title. */
const ATX_CLOSING = /[ \t]+#+$/;

/**
 * A setext underline: `=` for level one, `-` for level two (CommonMark §4.3).
 * The heading it forms starts at the first line of the paragraph above it, so
 * the boundary is recorded there rather than on the underline.
 */
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;

/**
 * A line that is nothing but an absolute-URL image reference. `gh pr edit
 * --attach` appends exactly this shape, so a run of them at the end of a body
 * is the residue of an earlier crash between attach and write. This skill's
 * own images never match as *standalone* (see `standaloneRun`) because it
 * always emits a `**caption**` line directly above each one.
 */
const IMAGE_ONLY_LINE = /^\s*!\[[^\]]*\]\(\s*https?:\/\/[^\s)]*\s*\)\s*$/;

/**
 * A fence delimiter: three or more backticks or tildes with whatever info
 * string follows. Captured as run and remainder so the mask can apply
 * CommonMark's closing rule — same character, at least as long, no info
 * string — rather than a blind toggle. Indentation is not bounded here: a
 * fence nested in a list item is indented past CommonMark's three-space limit
 * relative to the document, and a flat scanner cannot see the container that
 * would make it legal.
 */
const FENCE_DELIMITER = /^\s*(`{3,}|~{3,})[ \t]*(.*)$/;

/**
 * A block-level HTML comment opens a line and runs to the line carrying its
 * closer (CommonMark §4.6, HTML block type 2). Every line it spans is masked,
 * which is what keeps a commented-out `## Screenshots` placeholder — the shape
 * a PR template ships — from being read as this skill's own heading.
 */
const COMMENT_OPEN = /^ {0,3}<!--/;
const COMMENT_CLOSE = /-->/;

/**
 * A heading-shaped line indented four or more spaces is an indented code block
 * to CommonMark and a section boundary to every human reading the body. The
 * scan models neither reading, so it refuses.
 */
const INDENTED_HEADING = /^ {4,}#{1,2}(?:[ \t]|$)/;

/**
 * A raw HTML block opening a line (CommonMark §4.6, block types 1-7). The scan
 * models block-level HTML comments and no other HTML, so a `<div>`, a
 * `<table>`, a `<details>`, or a `<picture>` is an unmodeled construct: its
 * lines read as ordinary text, a `## Screenshots` line inside one reads as
 * this skill's own heading, and a replace that swallows the closing tag leaves
 * the container open and unrenders everything below it. A tag name is
 * required, so an autolink line such as `<https://example.com>` is not
 * mistaken for one.
 */
const HTML_BLOCK_OPEN = /^ {0,3}<\/?[A-Za-z][A-Za-z0-9-]*(?:[ \t/>]|$)/;

/**
 * An HTML image anywhere on a line. `ANY_IMAGE` cannot see one, so an `<img>`
 * inside the section a replace covers would be deleted with `changed: true`
 * and no reason — the silent loss "never delete what you did not write"
 * exists to prevent.
 */
const HTML_IMAGE = /<(?:img|picture|source|svg)\b/i;

/**
 * A reference-style, collapsed, or shortcut image — `![alt][ref]`, `![alt][]`,
 * `![ref]`. Its URL lives in a link reference definition elsewhere in the
 * document, so this transform can neither see the target nor keep the
 * definition and the use on the same side of a replace.
 */
const REFERENCE_IMAGE = /!\[[^\]]*\](?!\()/;

/** A link reference definition, the other half of a reference-style image. */
const LINK_REFERENCE = /^ {0,3}\[[^\]]*\]:[ \t]*\S/;

/**
 * A bare absolute URL alone on a line that the host auto-embeds: an
 * attachment URL, or one naming an image file. It renders as an image while
 * matching no markdown image shape at all.
 */
const BARE_IMAGE_URL =
  /^[ \t]*<?https?:\/\/[^\s<>]*(?:\/user-attachments\/[^\s<>]*|\.(?:png|jpe?g|gif|webp|svg|avif|bmp|tiff?)(?:[?#][^\s<>]*)?)>?[ \t]*$/i;

/**
 * Raw HTML in the SECTION, in any position, escaped or not. The section is
 * assembled from caller strings the normalization in
 * `references/01-input-and-result.md` backslash-escapes; this is the code-side
 * backstop for that rule, so a weakened or skipped escape cannot splice an
 * `<a href>` or an `<img src>` into a public body. An escaped `\<` is caller
 * text that renders as a literal and is left alone.
 */
const SECTION_HTML = /(?<!\\)<[A-Za-z/!?]/;

/**
 * An INLINE markdown image reference — the only image shape that reaches this
 * point, because `scan` faults on every other form. And the one this skill
 * writes.
 */
const ANY_IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const OWN_IMAGE = /^!\[screenshot-\d+\]\(\s*https?:\/\/[^\s)]+\s*\)$/;

/**
 * Rule 4 counts the NEW section by the alt form this skill emits, so caller
 * text that is itself a complete image reference cannot buy an all-failures
 * run past the guard.
 */
const NEW_SECTION_IMAGE = /!\[screenshot-\d+\]\(\s*https?:\/\//g;

/**
 * The construct on `line` that the model does not cover, or null. Called once
 * per unmasked line, and only while no fault is recorded yet: the first one
 * found is the one reported, and a fenced or commented line never reaches
 * here. Each reason is a predicate over the document, so a caller can print it
 * after "the body" or "the section".
 */
function unmodeled(line) {
  if (line.includes("<!--")) {
    return "carries an HTML comment that opens mid-line, which this transform does not model";
  }
  if (INDENTED_HEADING.test(line)) {
    return "carries a heading-shaped line indented into a code block, which this transform does not model";
  }
  if (HTML_BLOCK_OPEN.test(line)) {
    return "carries a raw HTML block, whose boundaries this transform does not model";
  }
  if (HTML_IMAGE.test(line)) {
    return "carries an HTML image tag, which this transform cannot count as an image";
  }
  if (REFERENCE_IMAGE.test(line)) {
    return "carries a reference-style image, whose target this transform cannot see";
  }
  if (LINK_REFERENCE.test(line)) {
    return "carries a link reference definition, which this transform does not model";
  }
  if (BARE_IMAGE_URL.test(line)) {
    return "carries a bare auto-embedded image URL, which this transform does not model";
  }
  return null;
}

/**
 * The document scan: one pass, producing the masked lines, the section
 * boundaries, the Screenshots headings, and the first construct the model does
 * not cover.
 *
 * `mask[i]` is true for fenced content and for HTML-comment lines, delimiters
 * included. A masked line is never a heading, a ticket reference, or an image
 * this transform acts on, and a replace runs straight through it — so a fenced
 * block is deleted whole or preserved whole, never split. `commented[i]` is the
 * comment half of that mask on its own, because a comment inside the range a
 * replace would cover is refused rather than deleted: a `-->` swallowed by a
 * replace leaves the comment open, and CommonMark then runs the HTML block to
 * end of document and renders the rest of the body as nothing.
 *
 * `boundary[i]` is true where a level-one or level-two section starts. A
 * level-one heading outranks `## Screenshots` and ends it the same way the
 * next `## ` does; a `### ` subheading belongs to the section above it and is
 * deliberately not a boundary.
 *
 * `fault` is non-null when the body carries a construct outside the model. It
 * is phrased as a predicate so a caller can attribute it: an unbalanced fence
 * hides every boundary below it, an unterminated comment hides the rest of the
 * document, a comment opening mid-line is inline HTML this scan does not
 * track, a heading indented into a code block reads as a boundary to a human
 * and as text to a parser, and `unmodeled` names the rest.
 */
function scan(lines) {
  const mask = new Array(lines.length).fill(false);
  const commented = new Array(lines.length).fill(false);
  const boundary = new Array(lines.length).fill(false);
  const labels = new Map();
  const headings = [];
  let fence = null;
  let comment = false;
  let fault = null;

  const label = (index, level, title) => {
    if (level > 2) return;
    labels.set(index, `${"#".repeat(level)} ${title}`);
    boundary[index] = true;
    if (title === SCREENSHOTS_TITLE) headings.push(index);
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    if (fence !== null) {
      mask[index] = true;
      const closer = FENCE_DELIMITER.exec(line);
      if (closer && closer[1][0] === fence.char && closer[1].length >= fence.length && closer[2].trim() === "") {
        fence = null;
      }
      continue;
    }
    if (comment) {
      mask[index] = true;
      commented[index] = true;
      if (COMMENT_CLOSE.test(line)) comment = false;
      continue;
    }

    const opener = FENCE_DELIMITER.exec(line);
    if (opener) {
      mask[index] = true;
      fence = { char: opener[1][0], length: opener[1].length };
      continue;
    }
    if (COMMENT_OPEN.test(line)) {
      mask[index] = true;
      commented[index] = true;
      comment = !COMMENT_CLOSE.test(line.slice(line.indexOf("<!--") + 4));
      continue;
    }
    if (fault === null) fault = unmodeled(line);

    const atx = ATX_HEADING.exec(line);
    if (atx) {
      label(index, atx[1].length, (atx[2] ?? "").replace(ATX_CLOSING, "").trim());
      continue;
    }

    const underline = SETEXT_UNDERLINE.exec(line);
    if (underline && index > 0 && !SETEXT_UNDERLINE.test(lines[index - 1])) {
      const start = paragraphStart(lines, mask, boundary, index - 1);
      if (start >= 0) {
        const level = underline[1][0] === "=" ? 1 : 2;
        label(start, level, start === index - 1 ? lines[start].trim() : "");
      }
    }
  }

  if (fence !== null) {
    fault ??= "carries an unclosed code fence, so its section boundaries cannot be read";
  }
  if (comment) {
    fault ??= "carries an unterminated HTML comment, so its section boundaries cannot be read";
  }
  return { mask, commented, boundary, labels, headings, fault };
}

/**
 * The first line of the paragraph ending at `from`, or -1 when no paragraph
 * ends there. A setext heading takes the whole paragraph above its underline
 * as its content, so that first line is where the section starts.
 */
function paragraphStart(lines, mask, boundary, from) {
  if (mask[from] || boundary[from] || lines[from].trim() === "") return -1;
  let start = from;
  while (start - 1 >= 0 && !mask[start - 1] && !boundary[start - 1] && lines[start - 1].trim() !== "") {
    start--;
  }
  return start;
}

/** The nearest section boundary at or above `from`, or -1. */
function boundaryAbove(doc, from) {
  for (let index = from; index >= 0; index--) {
    if (doc.boundary[index]) return index;
  }
  return -1;
}

/**
 * Rule 1's fourth member: the start of the run of image-only lines `index`
 * belongs to, when the line above that whole run is blank or absent. A run is
 * what `--attach` leaves after several uploads, and testing each line against
 * its immediate predecessor would classify only the first member — leaving the
 * rest inside the section, where the replace deletes them. Returns -1 when the
 * run is not standalone, which is the shape this skill's own captioned images
 * take.
 */
function standaloneRun(lines, doc, index) {
  if (doc.mask[index] || !IMAGE_ONLY_LINE.test(lines[index])) return -1;
  let start = index;
  while (start - 1 >= 0 && !doc.mask[start - 1] && IMAGE_ONLY_LINE.test(lines[start - 1])) start--;
  const above = lines[start - 1];
  if (above === undefined) return start;
  return !doc.mask[start - 1] && above.trim() === "" ? start : -1;
}

/**
 * Rule 1. The index of the last line of `content`: everything below it is the
 * maximal trailing run of blank lines, footer sections, ticket-reference
 * lines, and standalone absolute-URL image runs, in any order. Returns -1 when
 * the whole body is that run.
 *
 * The image runs are in there so the crash tail survives the splice by
 * construction: it leaves `content` before rule 2 chooses what to replace, and
 * rule 3 re-emits it byte-identical below the new section.
 */
function contentEnd(lines, doc) {
  let index = lines.length - 1;
  for (;;) {
    while (index >= 0 && !doc.mask[index] && lines[index].trim() === "") index--;
    if (index < 0) return -1;
    if (!doc.mask[index] && TICKET_REFERENCE.test(lines[index])) {
      index--;
      continue;
    }
    const run = standaloneRun(lines, doc, index);
    if (run >= 0) {
      index = run - 1;
      continue;
    }
    const heading = boundaryAbove(doc, index);
    if (heading >= 0 && FOOTER_SECTIONS.includes(doc.labels.get(heading))) {
      index = heading - 1;
      continue;
    }
    return index;
  }
}

/**
 * Rule 2's replace bound: the first line below `start` that is either the next
 * section boundary or a ticket-reference line, whichever comes first. The
 * second half is what keeps a closing line alive when a crash tail collapsed
 * the trailing block and pushed that line into `content`.
 */
function replaceEnd(lines, doc, start, limit) {
  for (let index = start + 1; index < limit; index++) {
    if (doc.mask[index]) continue;
    if (doc.boundary[index] || TICKET_REFERENCE.test(lines[index])) return index;
  }
  return limit;
}

/** The index of the first anchor heading in `content`, or -1. */
function anchorIndex(doc, limit) {
  for (let index = 0; index < limit; index++) {
    if (ANCHORS.includes(doc.labels.get(index))) return index;
  }
  return -1;
}

/** `lines` with one blank line appended unless it already ends blank or empty. */
function blankTerminated(lines) {
  if (lines.length === 0) return lines;
  return lines[lines.length - 1].trim() === "" ? lines : [...lines, ""];
}

/**
 * `text` split into lines with the blank ones at either end removed. The
 * section arrives from a file, so its trailing newline is an artifact of how
 * it was written rather than a decision. Left in, it stacks: the splice adds
 * its own separator blank, the trailing block re-emits the blank already there,
 * and every rerun of an identical section grows the body by one line and
 * reports `changed` — so the run reads as a fresh upload forever. Trimming
 * makes the transform canonical, which is what makes it idempotent.
 */
function trimmedLines(text) {
  const lines = text.split("\n");
  let first = 0;
  let last = lines.length - 1;
  while (first <= last && lines[first].trim() === "") first++;
  while (last >= first && lines[last].trim() === "") last--;
  return lines.slice(first, last + 1);
}

function count(text, pattern) {
  return (text.match(pattern) ?? []).length;
}

/** The image references in `text` that this skill did not write. */
function foreignImages(text) {
  return (text.match(ANY_IMAGE) ?? []).filter((image) => !OWN_IMAGE.test(image));
}

/** `text` with CRLF normalized to LF, split into lines. */
function bodyLines(text) {
  return (typeof text === "string" ? text : "").replace(/\r\n/g, "\n").split("\n");
}

/**
 * Every refusal computable from the body alone: the scan's fault, an ambiguous
 * pair of Screenshots headings, and the two constructs a replace of the
 * existing section would delete — a foreign image and an HTML comment. Returns
 * the reason, or "" when nothing in the body refuses.
 *
 * It is a function of the pre-image and nothing else, which is the whole point:
 * `--check` runs it in step A, before the first `gh pr edit --attach`, so a
 * refusal that this body was always going to produce is found while the body
 * is still untouched and the assets are still local. `splice` runs the same
 * function first, so the two can never disagree.
 */
export function bodyRefusal(body) {
  const lines = bodyLines(body);
  const doc = scan(lines);
  if (doc.fault) return `the body ${doc.fault}`;

  const contentCount = contentEnd(lines, doc) + 1;
  const found = doc.headings.filter((index) => index < contentCount);
  if (found.length > 1) {
    return `the body carries ${found.length} Screenshots headings; which one to replace is ambiguous`;
  }

  const start = found[0];
  if (start === undefined) return "";

  const stop = replaceEnd(lines, doc, start, contentCount);
  const foreign = foreignImages(lines.slice(start, stop).join("\n"));
  if (foreign.length > 0) {
    return `the Screenshots section holds an image this skill did not write (${foreign[0]}), so replacing it would delete it`;
  }
  for (let index = start; index < stop; index++) {
    if (doc.commented[index]) {
      return "the Screenshots section holds an HTML comment, so replacing it would delete text this skill did not write";
    }
  }
  return "";
}

/**
 * Splice `section` into `body`. The rules run in order: refuse a body or a
 * section this transform cannot read, refuse more image references than the
 * run landed, split the trailing block, then match/replace/insert inside
 * `content` only, then refuse to delete an image this skill did not write,
 * then re-emit the trailing block, then refuse a downgrade, then refuse an
 * overflow.
 *
 * `options.landed` is the run's count of assets that actually resolved to a
 * URL, and defaults to zero: a caller that does not say how many images landed
 * is treated as having landed none, so a section carrying
 * `![screenshot-NN](http…)` references it cannot account for is refused. Every
 * reference past the count came from caller text rather than from an upload,
 * and rule 4 must not be satisfiable by text the caller supplied.
 */
export function splice(body, section, options = {}) {
  const original = typeof body === "string" ? body : "";
  const sectionText = typeof section === "string" ? section.replace(/\r\n/g, "\n") : "";
  const refuse = (reason) => ({ body: original, changed: false, reason });

  if (sectionText.trim() === "") return refuse("the section to splice is empty");

  const lines = bodyLines(original);
  const doc = scan(lines);

  // The pre-image refusals, in the one place the `--check` mode reads them
  // from, so a body that step A cleared cannot refuse here for a body-only
  // reason and a body that step A refused cannot pass here.
  const blocked = bodyRefusal(original);
  if (blocked) return refuse(blocked);

  const sectionScan = scan(sectionText.split("\n"));
  if (sectionScan.fault) return refuse(`the section ${sectionScan.fault}`);
  if (SECTION_HTML.test(sectionText)) {
    return refuse("the section carries unescaped raw HTML, which must never reach a public body");
  }

  const landed = Number.isFinite(options?.landed) ? options.landed : 0;
  const referenced = count(sectionText, NEW_SECTION_IMAGE);
  if (referenced > landed) {
    return refuse(`the section carries more screenshot references (${referenced}) than the run landed (${landed})`);
  }

  const end = contentEnd(lines, doc);
  const contentCount = end + 1;
  const footerLines = lines.slice(contentCount);

  // At most one, and its contents already cleared: an ambiguous pair, a
  // foreign image, and an embedded comment are `bodyRefusal`'s to refuse.
  const found = doc.headings.filter((index) => index < contentCount);

  const sectionLines = trimmedLines(sectionText);
  let existing = "";
  let spliced;

  const start = found[0];
  if (start !== undefined) {
    const stop = replaceEnd(lines, doc, start, contentCount);
    existing = lines.slice(start, stop).join("\n");
    const tail = lines.slice(stop, contentCount);
    const head = lines.slice(0, start);
    spliced = [...head, ...(tail.length > 0 ? blankTerminated(sectionLines) : sectionLines), ...tail];
  } else {
    const anchor = anchorIndex(doc, contentCount);
    spliced =
      anchor >= 0
        ? [
            ...blankTerminated(lines.slice(0, anchor)),
            ...blankTerminated(sectionLines),
            ...lines.slice(anchor, contentCount),
          ]
        : [...blankTerminated(lines.slice(0, contentCount)), ...sectionLines];
  }

  const held = count(existing, ANY_IMAGE);
  if (referenced < held) {
    return refuse(
      `the new section carries ${referenced} screenshot references and the one it replaces holds ${held}`,
    );
  }

  // A blank line separates the trailing block from the section above it.
  // Joined flush, a lifted image line lands directly under the section's last
  // line, which makes it non-standalone on the next run and sweeps it into the
  // section the run after that replaces — so preservation would survive one
  // round-trip and then delete.
  const gap =
    footerLines.length > 0 && footerLines[0].trim() !== "" && spliced.length > 0 && spliced[spliced.length - 1].trim() !== ""
      ? [""]
      : [];

  const written = [...spliced, ...gap, ...footerLines].join("\n");
  if (written.length > BODY_LIMIT) {
    return refuse(`the spliced body is ${written.length} characters, over the ${BODY_LIMIT}-character limit`);
  }
  if (written === original) return refuse("the body already carries this section");

  return { body: written, changed: true, reason: "" };
}

// CLI entry point — runs only on direct execution, never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  // A flag whose next token is itself a flag has no value: returning that
  // token would bind `--body-file --landed 2` to the string "--landed" and
  // read a file by that name. `null` is "present and malformed", which is a
  // usage fault rather than an absent flag.
  const flag = (name) => {
    const at = argv.indexOf(name);
    if (at < 0) return undefined;
    const value = argv[at + 1];
    return value === undefined || value.startsWith("--") ? null : value;
  };
  const checkOnly = argv.includes("--check");
  const bodyFile = flag("--body-file");
  const sectionFile = flag("--section-file");
  const landedFlag = flag("--landed");

  const fail = (message) => {
    process.stderr.write(`splice.mjs: ${message}\n`);
    process.exit(2);
  };

  // `--landed` is required: the guard it feeds exists for the case where the
  // caller-string escaping upstream has been weakened, and a guard that a
  // caller can switch off by omitting a flag guards nothing.
  if (!bodyFile || (!checkOnly && (!sectionFile || !landedFlag))) {
    fail(
      "usage: splice.mjs --body-file <path> --section-file <path> --landed <count>\n" +
        "       splice.mjs --check --body-file <path>",
    );
  }

  // Exit 2, not 1: an unreadable input is an environment fault, and the caller
  // reads exit 1 as "no rule allowed the write". A stack trace on the refusal
  // code makes those two indistinguishable (principle-fail-closed).
  const slurp = (path, label) => {
    try {
      return readFileSync(path, "utf8");
    } catch (error) {
      return fail(`cannot read the ${label} at "${path}": ${error.message}`);
    }
  };

  // `--check` is the step-A mode: the pre-image alone, no section, no write.
  // Exit 1 here is a refusal the caller must act on BEFORE the first attach,
  // which is what makes "refuse before mutating" true rather than aspirational.
  if (checkOnly) {
    const reason = bodyRefusal(slurp(bodyFile, "body file"));
    if (reason) {
      process.stderr.write(`refused: ${reason}\n`);
      process.exit(1);
    }
    process.exit(0);
  }

  const landed = Number(landedFlag);
  if (!Number.isInteger(landed) || landed < 0) fail(`--landed expects a non-negative integer, got "${landedFlag}"`);

  const result = splice(slurp(bodyFile, "body file"), slurp(sectionFile, "section file"), { landed });
  if (!result.changed) {
    process.stderr.write(`unchanged: ${result.reason}\n`);
    process.exit(1);
  }
  process.stdout.write(result.body);
}
