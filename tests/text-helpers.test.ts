// tests/text-helpers.test.ts
//
// L1 unit tests for the two shared frontmatter helpers in tests/helpers/text.ts,
// plus one L2 tripwire pinning that `descriptionText()` has a single owner.
//
// Both helpers are load-bearing: every structural suite in this repo reads
// frontmatter through `frontmatter()`, and every description-offset check
// counts characters on `descriptionText()` output. A silent wrong answer from
// either one turns those suites green while wrong, which is the exact failure
// mode this file exists to prevent.
//
// The behavior being pinned:
//
//   frontmatter()      Returns the lines strictly between the first and second
//                      `---` markers. ZERO markers -> "" (tests/docs-nav.test.ts
//                      depends on that). Exactly ONE marker is an UNTERMINATED
//                      block and THROWS, quoting the offending text. Returning
//                      the whole file body instead would run a class or key
//                      predicate against body prose.
//
//   descriptionText()  Extracts the `description:` value from a frontmatter
//                      slice across the YAML styles in use, and throws on a
//                      style it cannot parse rather than scanning text YAML
//                      would read differently.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { descriptionText, frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const SKILLS_ROOT = join(REPO_ROOT, "skills");

// A file whose frontmatter opens and never closes. Exactly 17 lines follow the
// lone `---`, which is the count the error reports. The error quotes both
// signals the signature can offer — it takes text and no path: the first line
// of the block, and the number of lines the block swallowed.
const UNTERMINATED_17_LINES = [
  "---",
  "name: broken",
  "effort: low",
  "argument-hint: \"[x]\"",
  "a: 1",
  "b: 2",
  "c: 3",
  "d: 4",
  "e: 5",
  "f: 6",
  "g: 7",
  "h: 8",
  "i: 9",
  "j: 10",
  "k: 11",
  "l: 12",
  "m: 13",
  "n: 14",
].join("\n");

function skillFiles(): string[] {
  return readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(SKILLS_ROOT, entry.name, "SKILL.md"))
    .filter((file) => existsSync(file))
    .sort();
}

// Files whose frontmatter fails to parse, each with the error that stopped it,
// so one run names every offender.
function unparseableSkillFiles(): string[] {
  return skillFiles().flatMap((file) => {
    try {
      frontmatter(read(file));
      return [];
    } catch (err) {
      return [`${file}: ${String(err)}`];
    }
  });
}

function skillFilesWithEmptyDescription(): string[] {
  return skillFiles().filter((file) => descriptionText(frontmatter(read(file))).trim() === "");
}

describe("frontmatter()", () => {
  test("returns the lines strictly between the two markers", () => {
    const file = ["---", "name: example", "effort: low", "---", "", "Body prose."].join("\n");
    expect(frontmatter(file)).toBe("name: example\neffort: low");
  });

  test("returns \"\" for text with no --- marker at all", () => {
    // tests/docs-nav.test.ts's frontMatterValues() sweeps docs that carry no
    // frontmatter and depends on the empty slice. Zero markers is a legal
    // shape, not an error.
    expect(frontmatter("# A heading\n\nJust prose.\n")).toBe("");
  });

  test("returns \"\" when the first --- is a body thematic break, not frontmatter", () => {
    // Frontmatter is only frontmatter on line 1. A legal markdown file whose
    // body carries one thematic break has none, so it yields the empty slice
    // rather than throwing "unterminated".
    const file = ["# A heading", "", "Prose.", "", "---", "", "More prose."].join("\n");
    expect(frontmatter(file)).toBe("");
  });

  test("throws on an opening --- that is never closed", () => {
    expect(() => frontmatter(UNTERMINATED_17_LINES)).toThrow();
  });

  test("the unterminated-block error names the first line of the block", () => {
    expect(() => frontmatter(UNTERMINATED_17_LINES)).toThrow(/name: broken/);
  });

  test("the unterminated-block error names how many lines the block swallowed", () => {
    expect(() => frontmatter(UNTERMINATED_17_LINES)).toThrow(/\b17\b/);
  });

  test("every SKILL.md on disk parses without throwing", () => {
    // Blast-radius guard for the throw above: no file on disk is unterminated,
    // so the throw must not turn any existing suite red.
    expect(skillFiles().length).toBeGreaterThan(60);
    expect(unparseableSkillFiles()).toEqual([]);
  });
});

describe("descriptionText()", () => {
  test("reads a bare block scalar, trimming each line and joining with one space", () => {
    const fm = [
      "name: example",
      "description: |",
      "  First line of the summary,",
      "  second line of the summary.",
      "effort: medium",
    ].join("\n");
    expect(descriptionText(fm)).toBe("First line of the summary, second line of the summary.");
  });

  test("unwraps a double-quoted inline scalar", () => {
    const fm = ['name: example', 'description: "Apply when shipping. Never infer intent."'].join("\n");
    expect(descriptionText(fm)).toBe("Apply when shipping. Never infer intent.");
  });

  test("unwraps a single-quoted inline scalar", () => {
    const fm = ["name: example", "description: 'Apply when shipping.'"].join("\n");
    expect(descriptionText(fm)).toBe("Apply when shipping.");
  });

  test("returns a plain inline scalar verbatim", () => {
    const fm = ["name: example", "description: Apply when shipping.", "user-invocable: false"].join("\n");
    expect(descriptionText(fm)).toBe("Apply when shipping.");
  });

  test("throws on an inline scalar whose quote never closes", () => {
    // An unsupported style must fail loud. Returned verbatim, the surrounding
    // quote would make a phrase sweep treat the whole value as one "phrase"
    // and pass with zero real trigger phrases.
    const fm = ['name: example', 'description: "Apply when shipping'].join("\n");
    expect(() => descriptionText(fm)).toThrow();
  });

  test("returns \"\" when the frontmatter has no description key", () => {
    expect(descriptionText("name: example\neffort: low")).toBe("");
  });

  test("every skill on disk yields a non-empty description", () => {
    // Blindness floor. An extractor that returns "" for everything makes every
    // offset check downstream pass vacuously.
    expect(skillFiles().length).toBeGreaterThan(60);
    expect(skillFilesWithEmptyDescription()).toEqual([]);
  });
});

describe("descriptionText() has a single owner", () => {
  test("tests/architecture.test.ts imports the helper instead of declaring its own copy", () => {
    const text = read(join(REPO_ROOT, "tests", "architecture.test.ts"));
    // Guard: a renamed or moved suite must fail here, not pass the absence
    // check below vacuously.
    expect(text.length).toBeGreaterThan(0);

    expect(text).not.toContain("function descriptionText(");
    expect(text).toMatch(/import \{[\s\S]*?\bdescriptionText\b[\s\S]*?\} from "\.\/helpers\/text";/);
  });
});
