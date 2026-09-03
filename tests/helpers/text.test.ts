// tests/helpers/text.test.ts
//
// L1 pure unit: the frontmatter slicer and the field readers that every
// skill sweep depends on. The hazard they are shaped against is silence — a
// slice that reads too far, or a field read differently from the way the host
// reads it, makes a sweep pass on something nobody meant it to read. Both fail
// loudly instead, and those failure modes are pinned here rather than
// inferred from a green suite (docs/testing.md, "Prove a negative check can
// find a positive").
//
// Synthetic strings and temp roots throughout, except the closing differential,
// which is an L2 tripwire over the SKILL.md files on disk.

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  descriptionFor,
  descriptionText,
  frontmatter,
  isUserInvocable,
  read,
  userInvocableSkillFiles,
} from "./text";

const REPO_ROOT = join(import.meta.dir, "..", "..");

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
    // punctuation the host never renders. Caught by the no-nested-values rule
    // that every field read shares, so it names the key rather than the field.
    expect(() => descriptionText('description: ["One.", "Two."]')).toThrow(
      /unsupported nested frontmatter value for description/,
    );
  });

  test("throws on a flow mapping", () => {
    expect(() => descriptionText("description: { text: One. }")).toThrow(
      /unsupported nested frontmatter value for description/,
    );
  });

  test("throws on a description that is present but empty", () => {
    // `description:` alone parses to null. Reading it as "" would hide a
    // key that exists and says nothing behind an absent-key branch.
    expect(() => descriptionText("description:\neffort: low")).toThrow(
      /unsupported description value/,
    );
  });

  test("throws on a root merge key rather than resolving one", () => {
    // `<<: *anchor` splices the anchored mapping into the root, so this parser
    // reads a description the anchor holds. Merge keys are a YAML 1.1
    // extension a 1.2 host may leave unresolved, and a host that reads no
    // description at all disagrees with a sweep that read one. The anchor
    // itself is a nested value, which is what this rejects.
    const fm = ["name: x", "base: &b", "  description: Merged in.", "<<: *b"].join("\n");
    expect(() => descriptionText(fm)).toThrow(/unsupported nested frontmatter value for base/);
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

describe("isUserInvocable — the key that decides which files are swept", () => {
  test("an absent key leaves the skill user-invocable", () => {
    expect(isUserInvocable("name: x\ndescription: One line.")).toBe(true);
  });

  test("an explicit false hides the skill", () => {
    expect(isUserInvocable("name: x\nuser-invocable: false")).toBe(false);
  });

  test("an explicit true leaves the skill user-invocable", () => {
    expect(isUserInvocable("name: x\nuser-invocable: true")).toBe(true);
  });

  test("takes the last of two `user-invocable:` keys, as YAML does", () => {
    // The bypass this reader exists to close. A text match for the `false`
    // line finds it anywhere, so a file that appends `true` after it reads as
    // hidden to the sweep and as reachable to the host — and a file that
    // leaves the enumeration leaves every sweep built on it.
    expect(isUserInvocable("user-invocable: false\nuser-invocable: true")).toBe(true);
  });

  test("takes the last of the reverse pair too", () => {
    expect(isUserInvocable("user-invocable: true\nuser-invocable: false")).toBe(false);
  });

  test("throws on a quoted `false`, which is a string and not the boolean", () => {
    expect(() => isUserInvocable('user-invocable: "false"')).toThrow(
      /unsupported user-invocable value/,
    );
  });

  test("throws on a key that is present but empty", () => {
    expect(() => isUserInvocable("user-invocable:\nname: x")).toThrow(
      /unsupported user-invocable value/,
    );
  });

  test("a slice that is not a mapping leaves the skill user-invocable", () => {
    // The empty slice above all. Membership defaults on, so a malformed file
    // stays in the sweep and is judged there rather than vanishing from it.
    expect(isUserInvocable("")).toBe(true);
  });
});

describe("userInvocableSkillFiles — enumeration over both skill roots", () => {
  const DEV_ROOT = join(".claude", "skills");

  /** A temp repo root holding both skill roots, one SKILL.md per entry. */
  function rootWith(skills: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "skill-enumeration-test-"));
    for (const dir of ["skills", DEV_ROOT]) mkdirSync(join(root, dir), { recursive: true });
    for (const [relative, frontmatterText] of Object.entries(skills)) {
      mkdirSync(join(root, relative), { recursive: true });
      writeFileSync(join(root, relative, "SKILL.md"), `---\n${frontmatterText}\n---\nbody\n`);
    }
    return root;
  }

  test("a shadowed `user-invocable: false` is still enumerated", () => {
    // The reviewer's bypass end to end: the file the host registers as a
    // command must be the file the sweep reads.
    const root = rootWith({
      [join(DEV_ROOT, "shadowed")]: "name: shadowed\nuser-invocable: false\nuser-invocable: true",
      [join("skills", "hidden")]: "name: hidden\nuser-invocable: false",
    });
    try {
      expect(userInvocableSkillFiles(root)).toEqual([join(DEV_ROOT, "shadowed", "SKILL.md")]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the reverse pair is excluded, matching last-wins", () => {
    const root = rootWith({
      [join("skills", "reversed")]: "name: reversed\nuser-invocable: true\nuser-invocable: false",
    });
    try {
      expect(userInvocableSkillFiles(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a non-boolean `user-invocable` fails with the path leading the message", () => {
    const root = rootWith({ [join("skills", "broken")]: 'name: broken\nuser-invocable: "false"' });
    try {
      expect(() => userInvocableSkillFiles(root)).toThrow(
        new RegExp(`^${join("skills", "broken", "SKILL.md")}: unsupported user-invocable value`),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("the text read and the parser read agree on every SKILL.md on disk", () => {
  // L2 tripwire. The regex this replaced matched `user-invocable: false`
  // anywhere in the slice; the parser resolves the key the way the host does.
  // Any file where the two answers differ is a file the sweep and the host
  // disagree about, which is the whole defect. Asserting the agreement over
  // real files is the check that would have caught it.

  function skillFiles(): string[] {
    return ["skills", join(".claude", "skills")].flatMap((root) =>
      readdirSync(join(REPO_ROOT, root))
        .map((name) => join(root, name, "SKILL.md"))
        .filter((relative) => existsSync(join(REPO_ROOT, relative))),
    );
  }

  test("no shipped skill reads one way to a text match and the other to the parser", () => {
    const files = skillFiles();
    // Haystack guard: an empty enumeration would agree vacuously.
    expect(files.length).toBeGreaterThan(80);

    const disagreements = files.filter((relative) => {
      const fm = frontmatter(read(join(REPO_ROOT, relative)));
      return /^user-invocable: false$/m.test(fm) === isUserInvocable(fm);
    });
    expect(disagreements).toEqual([]);
  });

  test("the differential can see a disagreement", () => {
    const shadowed = "name: x\nuser-invocable: false\nuser-invocable: true";
    expect(/^user-invocable: false$/m.test(shadowed)).toBe(true);
    expect(isUserInvocable(shadowed)).toBe(true);
  });
});
