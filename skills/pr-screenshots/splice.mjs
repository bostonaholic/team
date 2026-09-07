#!/usr/bin/env node

/**
 * The Screenshots-section body transform, as a pure function.
 *
 *     import { splice } from "<skill-dir>/splice.mjs";
 *     const { body, changed, reason } = splice(currentBody, section, { landed });
 *
 *     node "<skill-dir>/splice.mjs" --body-file <path> --section-file <path> \
 *       [--landed <count>]
 *
 * `f(body, section, options) -> {body, changed, reason}`: no network, no `gh`,
 * no mutation of anything on disk. Fence tracking, the trailing-block split,
 * and the refusals are neither deterministic nor testable as prose, which is
 * why they are code (docs/testing.md, "L1: Pure unit"). `reason` is non-empty
 * whenever a rule refuses, and empty on a write.
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

/** A level-two heading, and the Screenshots heading specifically. */
const HEADING = /^##\s/;
const SCREENSHOTS = /^##\s+Screenshots\s*$/;

/**
 * What ends a `## ` section: a heading of level one or two. A level-one
 * heading outranks `## Screenshots`, so it bounds the section the same way the
 * next `## ` does — matching `^##\s` alone let rule 2's replace run straight
 * through a `# Release notes` section and delete it. A `### ` subheading is
 * deliberately NOT a boundary: it belongs to the section above it, so
 * replacing a section replaces its subheadings with it.
 */
const SECTION_BOUNDARY = /^#{1,2}\s/;

/**
 * A line that is nothing but an absolute-URL image reference. `gh pr edit
 * --attach` appends exactly this shape, so a run of them at the end of a body
 * is the residue of an earlier crash between attach and write. This skill's
 * own images never match as *standalone* (see `standaloneImage`) because it
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
 * Rule 4 counts asymmetrically. The NEW section counts only the alt form this
 * skill emits, so caller text that is itself a complete image reference cannot
 * buy an all-failures run past the guard; the EXISTING section counts any
 * absolute-URL image, so the guard survives whatever URL form the host returns.
 */
const NEW_SECTION_IMAGE = /!\[screenshot-\d+\]\(\s*https?:\/\//g;
const EXISTING_IMAGE = /!\[[^\]]*\]\(\s*https?:\/\//g;

/**
 * Per-line "is inside a fenced block", with the delimiter lines themselves
 * true, plus whether every fence closed.
 *
 * A blind toggle is wrong twice over, and both ways lose text silently. An
 * unclosed fence masks the whole rest of the body, which hides the ticket
 * lines and headings that bound the replace. And a nested block — the
 * four-backtick `DATA` wrapper `skills/cross-model-review/SKILL.md` mandates,
 * carrying three-backtick blocks inside it — inverts the mask, which hides the
 * real `## Screenshots` heading and inserts a second one. So a closer must
 * match its opener's character, be at least as long, and carry no info string;
 * anything else is content.
 */
function fenceMask(lines) {
  const mask = [];
  let open = null;
  for (const line of lines) {
    const match = FENCE_DELIMITER.exec(line);
    if (!match) {
      mask.push(open !== null);
      continue;
    }
    const run = match[1];
    const info = match[2].trim();
    if (open === null) {
      open = { char: run[0], length: run.length };
    } else if (run[0] === open.char && run.length >= open.length && info === "") {
      open = null;
    }
    mask.push(true);
  }
  return { mask, balanced: open === null };
}

/** The heading text of `line`, whitespace-collapsed, for an exact list test. */
function headingTitle(line) {
  return line.trim().replace(/\s+/g, " ");
}

/** The nearest non-fenced level-one-or-two heading at or above `from`, or -1. */
function headingAbove(lines, mask, from) {
  for (let index = from; index >= 0; index--) {
    if (!mask[index] && SECTION_BOUNDARY.test(lines[index])) return index;
  }
  return -1;
}

/**
 * Rule 1's fourth member: an image-only line whose predecessor is blank or
 * absent. That is what `--attach` appends and what this skill never emits, so
 * it separates crash residue from the section's own captioned images without
 * needing to know which run wrote what.
 */
function standaloneImage(lines, mask, index) {
  if (mask[index] || !IMAGE_ONLY_LINE.test(lines[index])) return false;
  const above = lines[index - 1];
  return above === undefined || above.trim() === "";
}

/**
 * Rule 1. The index of the last line of `content`: everything below it is the
 * maximal trailing run of blank lines, footer sections, ticket-reference
 * lines, and standalone absolute-URL image lines, in any order. Returns -1
 * when the whole body is that run.
 *
 * The image lines are in that run so the crash tail survives the splice by
 * construction: it leaves `content` before rule 2 chooses what to replace, and
 * rule 3 re-emits it byte-identical below the new section.
 */
function contentEnd(lines, mask) {
  let index = lines.length - 1;
  for (;;) {
    while (index >= 0 && !mask[index] && lines[index].trim() === "") index--;
    if (index < 0) return -1;
    if (!mask[index] && TICKET_REFERENCE.test(lines[index])) {
      index--;
      continue;
    }
    if (standaloneImage(lines, mask, index)) {
      index--;
      continue;
    }
    const heading = headingAbove(lines, mask, index);
    if (heading >= 0 && FOOTER_SECTIONS.includes(headingTitle(lines[heading]))) {
      index = heading - 1;
      continue;
    }
    return index;
  }
}

/**
 * Rule 2's replace bound: the first line below `start` that is either the next
 * fence-aware section boundary or a ticket-reference line, whichever comes
 * first. The second half is what keeps a closing line alive when a crash tail
 * collapsed the trailing block and pushed that line into `content`.
 */
function replaceEnd(lines, mask, start) {
  for (let index = start + 1; index < lines.length; index++) {
    if (mask[index]) continue;
    if (SECTION_BOUNDARY.test(lines[index]) || TICKET_REFERENCE.test(lines[index])) return index;
  }
  return lines.length;
}

/** The index of the first anchor heading in `content`, or -1. */
function anchorIndex(lines, mask) {
  for (let index = 0; index < lines.length; index++) {
    if (mask[index]) continue;
    if (HEADING.test(lines[index]) && ANCHORS.includes(headingTitle(lines[index]))) return index;
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

/**
 * Splice `section` into `body`. The rules run in order: refuse a body or a
 * section this transform cannot read, refuse more image references than the
 * run landed, split the trailing block, then match/replace/insert inside
 * `content` only, then re-emit the trailing block, then refuse a downgrade,
 * then refuse an overflow.
 *
 * `options.landed` is the run's count of assets that actually resolved to a
 * URL. When given, a section carrying more `![screenshot-NN](http…)`
 * references than that is refused: every reference past the count came from
 * caller text rather than from an upload, and rule 4 must not be satisfiable
 * by text the caller supplied.
 */
export function splice(body, section, options = {}) {
  const original = typeof body === "string" ? body : "";
  const sectionText = typeof section === "string" ? section.replace(/\r\n/g, "\n") : "";
  const refuse = (reason) => ({ body: original, changed: false, reason });

  if (sectionText.trim() === "") return refuse("the section to splice is empty");

  const lines = original.replace(/\r\n/g, "\n").split("\n");
  const { mask, balanced } = fenceMask(lines);
  if (!balanced) {
    return refuse("the body carries an unclosed code fence, so its section boundaries cannot be read");
  }
  if (!fenceMask(sectionText.split("\n")).balanced) {
    return refuse("the section carries an unclosed code fence");
  }

  const landed = options?.landed;
  if (typeof landed === "number" && Number.isFinite(landed)) {
    const referenced = count(sectionText, NEW_SECTION_IMAGE);
    if (referenced > landed) {
      return refuse(`the section carries more screenshot references (${referenced}) than the run landed (${landed})`);
    }
  }

  const end = contentEnd(lines, mask);
  const contentLines = lines.slice(0, end + 1);
  const footerLines = lines.slice(end + 1);

  const headings = [];
  for (let index = 0; index < contentLines.length; index++) {
    if (!mask[index] && SCREENSHOTS.test(contentLines[index])) headings.push(index);
  }
  if (headings.length > 1) {
    return refuse(`the body carries ${headings.length} Screenshots headings; which one to replace is ambiguous`);
  }

  const sectionLines = trimmedLines(sectionText);
  let existing = "";
  let spliced;

  if (headings.length === 1) {
    const start = headings[0];
    const stop = replaceEnd(contentLines, mask, start);
    existing = contentLines.slice(start, stop).join("\n");
    const tail = contentLines.slice(stop);
    const head = contentLines.slice(0, start);
    spliced = [...head, ...(tail.length > 0 ? blankTerminated(sectionLines) : sectionLines), ...tail];
  } else {
    const anchor = anchorIndex(contentLines, mask);
    spliced =
      anchor >= 0
        ? [
            ...blankTerminated(contentLines.slice(0, anchor)),
            ...blankTerminated(sectionLines),
            ...contentLines.slice(anchor),
          ]
        : [...blankTerminated(contentLines), ...sectionLines];
  }

  if (count(sectionText, NEW_SECTION_IMAGE) === 0 && count(existing, EXISTING_IMAGE) > 0) {
    return refuse("the existing Screenshots section holds resolved images and the new one holds none");
  }

  const written = [...spliced, ...footerLines].join("\n");
  if (written.length > BODY_LIMIT) {
    return refuse(`the spliced body is ${written.length} characters, over the ${BODY_LIMIT}-character limit`);
  }
  if (written === original) return refuse("the body already carries this section");

  return { body: written, changed: true, reason: "" };
}

// CLI entry point — runs only on direct execution, never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const at = argv.indexOf(name);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  const bodyFile = flag("--body-file");
  const sectionFile = flag("--section-file");
  const landedFlag = flag("--landed");

  const fail = (message) => {
    process.stderr.write(`splice.mjs: ${message}\n`);
    process.exit(2);
  };

  if (!bodyFile || !sectionFile) {
    fail("usage: splice.mjs --body-file <path> --section-file <path> [--landed <count>]");
  }

  let landed;
  if (landedFlag !== undefined) {
    landed = Number(landedFlag);
    if (!Number.isInteger(landed) || landed < 0) fail(`--landed expects a non-negative integer, got "${landedFlag}"`);
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

  const result = splice(slurp(bodyFile, "body file"), slurp(sectionFile, "section file"), { landed });
  if (!result.changed) {
    process.stderr.write(`unchanged: ${result.reason}\n`);
    process.exit(1);
  }
  process.stdout.write(result.body);
}
