#!/usr/bin/env node

/**
 * The Screenshots-section body transform, as a pure function.
 *
 *     import { splice } from "<skill-dir>/splice.mjs";
 *     const { body, changed, reason } = splice(currentBody, section);
 *
 *     node "<skill-dir>/splice.mjs" --body-file <path> --section-file <path>
 *
 * `f(body, section) -> {body, changed, reason}`: no network, no `gh`, no
 * mutation of anything on disk. Fence tracking, the trailing-block split, and
 * the two refusals are neither deterministic nor testable as prose, which is
 * why they are code (docs/testing.md, "L1: Pure unit"). `reason` is non-empty
 * whenever a rule refuses, and empty on a write.
 *
 * The CLI guard at the bottom follows resolve-transcript.mjs and
 * write-target.mjs: it runs only on direct execution, so a test import has no
 * side effects.
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

/** A fence delimiter, either style. */
const FENCE = /^\s*(?:```|~~~)/;

/**
 * Rule 4 counts asymmetrically. The NEW section counts only the alt form this
 * skill emits, so caller text that is itself a complete image reference cannot
 * buy an all-failures run past the guard; the EXISTING section counts any
 * absolute-URL image, so the guard survives whatever URL form the host returns.
 */
const NEW_SECTION_IMAGE = /!\[screenshot-\d+\]\(\s*https?:\/\//g;
const EXISTING_IMAGE = /!\[[^\]]*\]\(\s*https?:\/\//g;

/** Per-line "is inside a fenced block", with the delimiter lines themselves true. */
function fenceMask(lines) {
  const mask = [];
  let open = false;
  for (const line of lines) {
    if (FENCE.test(line)) {
      mask.push(true);
      open = !open;
      continue;
    }
    mask.push(open);
  }
  return mask;
}

/** The heading text of `line`, whitespace-collapsed, for an exact list test. */
function headingTitle(line) {
  return line.trim().replace(/\s+/g, " ");
}

/** The nearest non-fenced `## ` heading at or above `from`, or -1. */
function headingAbove(lines, mask, from) {
  for (let index = from; index >= 0; index--) {
    if (!mask[index] && HEADING.test(lines[index])) return index;
  }
  return -1;
}

/**
 * Rule 1. The index of the last line of `content`: everything below it is the
 * maximal trailing run of blank lines, footer sections, and ticket-reference
 * lines, in any order. Returns -1 when the whole body is that run.
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
 * fence-aware `## ` heading or a ticket-reference line, whichever comes first.
 * The second half is what keeps a closing line alive when a crash tail
 * collapsed the trailing block and pushed that line into `content`.
 */
function replaceEnd(lines, mask, start) {
  for (let index = start + 1; index < lines.length; index++) {
    if (mask[index]) continue;
    if (HEADING.test(lines[index]) || TICKET_REFERENCE.test(lines[index])) return index;
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

function count(text, pattern) {
  return (text.match(pattern) ?? []).length;
}

/**
 * Splice `section` into `body`. The five rules run in order: split the trailing
 * block, then match/replace/insert inside `content` only, then re-emit the
 * trailing block, then refuse a downgrade, then refuse an overflow.
 */
export function splice(body, section) {
  const original = typeof body === "string" ? body : "";
  const sectionText = typeof section === "string" ? section.replace(/\r\n/g, "\n") : "";
  const refuse = (reason) => ({ body: original, changed: false, reason });

  if (sectionText.trim() === "") return refuse("the section to splice is empty");

  const lines = original.replace(/\r\n/g, "\n").split("\n");
  const mask = fenceMask(lines);

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

  const sectionLines = sectionText.split("\n");
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

  if (!bodyFile || !sectionFile) {
    process.stderr.write("usage: splice.mjs --body-file <path> --section-file <path>\n");
    process.exit(2);
  }

  const result = splice(readFileSync(bodyFile, "utf8"), readFileSync(sectionFile, "utf8"));
  if (!result.changed) {
    process.stderr.write(`unchanged: ${result.reason}\n`);
    process.exit(1);
  }
  process.stdout.write(result.body);
}
