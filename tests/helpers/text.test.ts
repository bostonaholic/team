// tests/helpers/text.test.ts
//
// L1 pure unit: the frontmatter slicer and the description parser that every
// description sweep depends on. Both fail SILENTLY when they fail — a slice
// that reads too far, or a description read only down to its first blank
// line, makes a sweep pass on text nobody meant it to read. Their failure
// modes are pinned here rather than inferred from a green suite
// (docs/testing.md, "Prove a negative check can find a positive").
//
// Synthetic strings throughout, except the descriptionFor() case, which needs
// a file on disk and asserts on the message prefix only.

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { descriptionFor, descriptionText, frontmatter } from "./text";

describe("frontmatter — the slice between two markers", () => {
  test("returns the slice when both markers are present", () => {
    const text = ["---", "name: real", "---", "", "# Body"].join("\n");
    expect(frontmatter(text)).toBe("name: real");
  });

  test("returns nothing when the file has no marker at all", () => {
    expect(frontmatter("# Body\n\nProse.\n")).toBe("");
  });

  test("returns nothing when the closing marker is missing", () => {
    // Returning the rest of the file would let a body sentence satisfy a
    // frontmatter check.
    const text = ["---", "name: truncated", "", "# Body", "user-invocable: false"].join("\n");
    expect(frontmatter(text)).toBe("");
  });
});

describe("descriptionText — the description value, whatever its scalar style", () => {
  test("reads an inline scalar", () => {
    expect(descriptionText("name: x\ndescription: One line.")).toBe("One line.");
  });

  test("reads a block scalar up to the next unindented key", () => {
    const fm = ["description: |", "  First line.", "  Second line.", "effort: low"].join("\n");
    expect(descriptionText(fm)).toBe("First line. Second line.");
  });

  test("reads past a paragraph break inside a block scalar", () => {
    // A blank line is legal inside a `|` block, so it continues the block. A
    // parser that stopped there would read a guard sitting after the break as
    // absent.
    const fm = ["description: |", "  Before the break.", "", "  After the break.", "effort: low"].join(
      "\n",
    );
    expect(descriptionText(fm)).toBe("Before the break. After the break.");
  });

  test("throws on a folded scalar", () => {
    // `description: >` would otherwise yield the literal ">" and drop the
    // body, which passes an absence check for the wrong reason.
    expect(() => descriptionText("description: >\n  Folded body.\n")).toThrow(
      /unsupported description scalar style/,
    );
  });

  test("throws on an unterminated quote", () => {
    expect(() => descriptionText('description: "opens but never closes\n')).toThrow(
      /unsupported description scalar style/,
    );
  });
});

describe("descriptionFor — a malformed file names itself", () => {
  test("leads the message with the repo-relative path", () => {
    const root = mkdtempSync(join(tmpdir(), "text-helpers-test-"));
    try {
      const file = join("skills", "broken", "SKILL.md");
      mkdirSync(join(root, "skills", "broken"), { recursive: true });
      writeFileSync(join(root, file), "---\nname: broken\ndescription: >\n  Folded.\n---\n");

      expect(() => descriptionFor(root, file)).toThrow(new RegExp(`^${file}`));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
