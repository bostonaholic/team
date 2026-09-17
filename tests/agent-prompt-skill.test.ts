// tests/agent-prompt-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `agent-prompt` RUNTIME skill
// (skills/agent-prompt/SKILL.md) — a standalone utility distributed to Team's
// users. It composes an agent-optimized prompt for a task from a short
// description and an optional target repo, and emits text. It dispatches
// nothing and runs nothing.
//
// Every assertion is guarded so a not-yet-existing file yields a failed
// expect(), never an uncaught ENOENT.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { description, frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
// agent-prompt is a RUNTIME skill — under skills/ (distributed), not .claude/.
const SKILL = join(REPO_ROOT, "skills", "agent-prompt", "SKILL.md");
const TEMPLATE = join(
  REPO_ROOT,
  "skills",
  "agent-prompt",
  "references",
  "01-agent-prompt-template.md",
);

// Defensive reads: a missing file reads as "" so assertions FAIL, never throw.
function source(path: string): string {
  return existsSync(path) ? read(path) : "";
}

// Every key at column zero in the frontmatter slice, sorted.
function frontmatterKeys(fm: string): string[] {
  return [...fm.matchAll(/^([a-z-]+):/gm)].map((match) => match[1] as string).sort();
}

// The prompt sections the emitted text must carry. The template is the schema
// a filling agent follows, so its headings are the machine-facing contract,
// not prose wording.
const SECTIONS = [
  "## Title and one-line goal",
  "## Repo and scope",
  "## Why",
  "## Ground truth",
  "## Required changes",
  "## Constraints",
  "## Acceptance criteria",
  "## Out of scope",
  "## Evidence rule",
];

// Sections absent from `text`. Pure over text so the planted-positive test can
// drive the same check the sweep runs.
function missingSections(text: string, sections: string[]): string[] {
  return sections.filter((section) => !text.includes(section));
}

describe("agent-prompt skill: invocation surface", () => {
  test("skill file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(SKILL)).toBe(true);
  });

  test("frontmatter carries exactly name, description, effort, and argument-hint", () => {
    const fm = frontmatter(source(SKILL));
    // Guard: an empty frontmatter must fail, not vacuously pass.
    expect(fm.length).toBeGreaterThan(0);
    expect(frontmatterKeys(fm)).toEqual([
      "argument-hint",
      "description",
      "effort",
      "name",
    ]);
  });

  test("frontmatter declares name: agent-prompt and effort: medium", () => {
    const fm = frontmatter(source(SKILL));
    expect(/^name:\s*agent-prompt\s*$/m.test(fm)).toBe(true);
    expect(/^effort:\s*medium\s*$/m.test(fm)).toBe(true);
  });

  test("frontmatter neither guards nor hides the skill", () => {
    const fm = frontmatter(source(SKILL));
    expect(/^disable-model-invocation:/m.test(fm)).toBe(false);
    expect(/^user-invocable:\s*false/m.test(fm)).toBe(false);
  });

  test("description carries the literal /agent-prompt and a double-quoted trigger phrase", () => {
    const text = description(source(SKILL));
    // Guard: a missing description must fail, not vacuously pass.
    expect(text.length).toBeGreaterThan(0);
    expect(/\/agent-prompt(?![a-z0-9-])/.test(text)).toBe(true);
    const phrases = [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1] as string);
    expect(phrases.filter((phrase) => !phrase.startsWith("/")).length).toBeGreaterThan(0);
  });
});

describe("agent-prompt skill: prompt template", () => {
  test("SKILL.md links the template at its reference path", () => {
    const link = "references/01-agent-prompt-template.md";
    expect(source(SKILL)).toContain(link);
  });

  test("the linked template resolves on disk", () => {
    expect(existsSync(TEMPLATE)).toBe(true);
  });

  test("the template carries every prompt section", () => {
    const text = source(TEMPLATE);
    // Guard: a missing or renamed file must fail, not pass the sweep vacuously.
    expect(text.length).toBeGreaterThan(0);
    expect(missingSections(text, SECTIONS)).toEqual([]);
  });

  test("the section sweep can see a missing section", () => {
    const withoutWhy = SECTIONS.filter((section) => section !== "## Why").join("\n");
    expect(missingSections(withoutWhy, SECTIONS)).toEqual(["## Why"]);
  });
});

describe("agent-prompt skill: produces text only", () => {
  test("never dispatches, pushes, or opens a PR", () => {
    const text = source(SKILL);
    // Guard: an empty body must fail, not vacuously pass the absence checks.
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("never dispatch");
    expect(text).not.toContain("git push");
    expect(text).not.toContain("gh pr create");
  });
});
