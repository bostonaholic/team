// tests/helpers/text.test.ts
//
// L1 pure unit: the frontmatter slicer and the description parser that every
// description sweep depends on. The hazard they are shaped against is silence
// — a slice that reads too far, or a description read only down to its first
// blank line, makes a sweep pass on text nobody meant it to read. Both fail
// loudly instead, and those failure modes are pinned here rather than
// inferred from a green suite (docs/testing.md, "Prove a negative check can
// find a positive").
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

  test("returns nothing when the opening marker does not open the file", () => {
    // Two thematic breaks in a body are not a frontmatter block. Slicing
    // between them would let body prose satisfy a frontmatter check.
    const text = ["# Body", "", "---", "user-invocable: false", "---", "More prose."].join("\n");
    expect(frontmatter(text)).toBe("");
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

  test("reads a folded scalar", () => {
    // The host folds this to its body, so the sweep must read the body too.
    expect(descriptionText("description: >\n  Folded body.\n")).toBe("Folded body.");
  });

  test("drops a trailing comment on a plain scalar", () => {
    // Whitespace then `#` opens a YAML comment, so the host's parser never
    // sees the rest. Reading it would let text the host discards satisfy a
    // description check.
    expect(descriptionText("description: Visible. # Hidden from the host.")).toBe("Visible.");
  });

  test("keeps a `#` that no whitespace precedes on a plain scalar", () => {
    // `foo#bar` is one plain scalar in YAML, comment indicator and all.
    expect(descriptionText("description: Tagged as topic#42 here.")).toBe(
      "Tagged as topic#42 here.",
    );
  });

  test("keeps a `#` inside a quoted scalar", () => {
    expect(descriptionText('description: "Visible. # Still visible."')).toBe(
      "Visible. # Still visible.",
    );
  });

  test("keeps a `#` inside a block scalar", () => {
    // `#` is literal content in a `|` block. Stripping there would silently
    // truncate shipped descriptions that cite a heading such as `## [X.Y.Z]`.
    const fm = ["description: |", "  Cuts into a", "  `## [X.Y.Z]` section.", "effort: low"].join(
      "\n",
    );
    expect(descriptionText(fm)).toBe("Cuts into a `## [X.Y.Z]` section.");
  });

  test("throws on an unterminated quote", () => {
    // Malformed YAML is not a description. The wording is the parser's; that
    // it fails rather than guessing is the contract.
    expect(() => descriptionText('description: "opens but never closes\n')).toThrow();
  });

  test("ends a double-quoted scalar at its closing quote, not at the line's last quote", () => {
    // The comment's own text ends in `"`, so a check for a trailing quote
    // absorbs the whole comment. The host stops at the quote that closes.
    const fm = `description: "Trigger on '/foo'." # "Invoke ONLY on explicit foo intent"`;
    expect(descriptionText(fm)).toBe("Trigger on '/foo'.");
  });

  test("ends a single-quoted scalar at its closing quote, not at the line's last quote", () => {
    const fm = "description: 'Trigger on /foo.' # Invoke ONLY on explicit foo intent'";
    expect(descriptionText(fm)).toBe("Trigger on /foo.");
  });

  test("takes the last of two `description:` keys, as YAML does", () => {
    // An edit that appends a key instead of replacing one leaves the first
    // value in the file and none of it in the host. Reading the first would
    // let the shadowed text satisfy a description check.
    expect(descriptionText("description: Shadowed.\ndescription: Routed on.")).toBe("Routed on.");
  });

  test("returns nothing when there is no description key", () => {
    expect(descriptionText("name: x\neffort: low")).toBe("");
  });

  test("throws on a flow sequence", () => {
    // Returned as raw text, the brackets and quotes would match on
    // punctuation the host never renders.
    expect(() => descriptionText('description: ["One.", "Two."]')).toThrow(
      /unsupported description value/,
    );
  });

  test("throws on a flow mapping", () => {
    expect(() => descriptionText("description: { text: One. }")).toThrow(
      /unsupported description value/,
    );
  });

  test("throws on a description that is present but empty", () => {
    // `description:` alone parses to null. Reading it as "" would hide a
    // key that exists and says nothing behind an absent-key branch.
    expect(() => descriptionText("description:\neffort: low")).toThrow(
      /unsupported description value/,
    );
  });
});

describe("descriptionFor — a malformed file names itself", () => {
  test("leads the message with the repo-relative path", () => {
    const root = mkdtempSync(join(tmpdir(), "text-helpers-test-"));
    try {
      const file = join("skills", "broken", "SKILL.md");
      mkdirSync(join(root, "skills", "broken"), { recursive: true });
      writeFileSync(join(root, file), '---\nname: broken\ndescription: "unterminated\n---\n');

      expect(() => descriptionFor(root, file)).toThrow(new RegExp(`^${file}`));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
