// tests/helpers/skill-refs.test.ts
//
// L1 pure unit: the extractor that every load-site assertion depends on. If
// loadedSkills() goes blind, every consumer of it passes vacuously, so its
// failure modes are pinned here rather than inferred from a green suite
// (docs/testing.md, "Prove a negative check can find a positive").

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadedSkills, loadsSkill, skillNames } from "./skill-refs";

describe("loadedSkills — the load form", () => {
  test("extracts a single name", () => {
    expect(loadedSkills("Call the Skill tool with `git-commit`.")).toEqual(["git-commit"]);
  });

  test("extracts mid-sentence, lowercase verb", () => {
    const text = "When the failure is non-obvious, call the Skill tool with `systematic-debugging`.";
    expect(loadedSkills(text)).toEqual(["systematic-debugging"]);
  });

  test("extracts every name in a list form", () => {
    const text =
      "Call the Skill tool with `engineering-standards`, `principle-solid`, " +
      "`test-style`, and `systems-thinking`. None of the four is preloaded.";
    expect(loadedSkills(text)).toEqual([
      "engineering-standards",
      "principle-solid",
      "test-style",
      "systems-thinking",
    ]);
  });

  test("reads across a hard line wrap between the phrase and the name", () => {
    // The wrap this repo actually produces. A line-oriented match misses it.
    const text = "   PR is merged or when the user explicitly asks. Call the Skill tool with\n   `worktree-isolation` and follow its teardown procedure.";
    expect(loadedSkills(text)).toEqual(["worktree-isolation"]);
  });

  test("collects from several phrases in one document", () => {
    const text =
      "Call the Skill tool with `changelog` and apply it.\n\n" +
      "Later: call the Skill tool with `git-commit`.";
    expect(loadedSkills(text)).toEqual(["changelog", "git-commit"]);
  });

  test("dedupes a name loaded twice", () => {
    const text = "Call the Skill tool with `tracking-tickets`. Then call the Skill tool with `tracking-tickets`.";
    expect(loadedSkills(text)).toEqual(["tracking-tickets"]);
  });
});

describe("loadedSkills — what it must NOT collect", () => {
  test("a path-form citation is not a load", () => {
    const text = "The verdict-aggregation rules live in `skills/review-severity-tiers/SKILL.md`.";
    expect(loadedSkills(text)).toEqual([]);
  });

  test("stops at the end of the clause, so a later backticked name is not swept in", () => {
    const text = "Call the Skill tool with `changelog`. Separately, `git-commit` governs the subject line.";
    expect(loadedSkills(text)).toEqual(["changelog"]);
  });

  test("ignores backticked tokens that cannot be skill names", () => {
    const text =
      "Call the Skill tool with `changelog` and update `CHANGELOG.md`, " +
      "honoring `TEAM_DISABLE_CROSS_MODEL`, `design.md`, `## When Implementing`, " +
      "and `gh pr create --draft`.";
    expect(loadedSkills(text)).toEqual(["changelog"]);
  });

  test("a bare mention of the tool with no name yields nothing", () => {
    expect(loadedSkills("Call the Skill tool with each of these methodology skills:")).toEqual([]);
  });
});

describe("loadsSkill", () => {
  test("true for a loaded name, false for a merely cited one", () => {
    const text = "Call the Skill tool with `git-commit`. See `skills/writing-prose/SKILL.md`.";
    expect(loadsSkill(text, "git-commit")).toBe(true);
    expect(loadsSkill(text, "writing-prose")).toBe(false);
  });
});

describe("skillNames", () => {
  test("lists only directories that hold a SKILL.md", () => {
    const root = mkdtempSync(join(tmpdir(), "skill-refs-test-"));
    try {
      mkdirSync(join(root, "skills", "real"), { recursive: true });
      writeFileSync(join(root, "skills", "real", "SKILL.md"), "# real\n");
      // A directory with no SKILL.md is not a skill.
      mkdirSync(join(root, "skills", "empty"), { recursive: true });
      // A loose file at the skills/ root is not a skill either.
      writeFileSync(join(root, "skills", "registry.json"), "{}\n");

      const names = skillNames(root);
      expect(names.has("real")).toBe(true);
      expect(names.has("empty")).toBe(false);
      expect(names.size).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("resolves the real repo and includes a known skill", () => {
    // Positive control: proves the sweep in skill-tool-invocation.test.ts is
    // checking against a populated set, not an empty one.
    const names = skillNames(process.cwd());
    expect(names.size).toBeGreaterThan(50);
    expect(names.has("git-commit")).toBe(true);
    expect(names.has("no-such-skill")).toBe(false);
  });
});
