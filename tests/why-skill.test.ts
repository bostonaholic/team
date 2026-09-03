import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";

const ROOT = process.cwd();
const SKILL = join(ROOT, "skills", "why", "SKILL.md");
const REFERENCE = join(ROOT, "skills", "why", "references", "investigator.md");
const body = () => (existsSync(SKILL) ? read(SKILL) : "");
const metadata = () => (existsSync(SKILL) ? frontmatter(read(SKILL)) : "");

describe("why skill contract", () => {
  test("keeps its public routing interface", () => {
    const fm = metadata().replace(/\s+/g, " ");
    expect(fm).toMatch(/name:\s*why/);
    expect(fm).toMatch(/effort:\s*high/);
    expect(fm).toContain('argument-hint: "[<question, file, symbol, or decision>]"');
    for (const trigger of [
      "why does X work this way",
      "why was this built like this",
      "design rationale",
      "what's the history of",
      "/why",
    ]) {
      expect(fm).toContain(trigger);
    }
    expect(metadata()).not.toMatch(/^(disable-model-invocation|user-invocable):/m);
  });

  test("keeps the evidence grades, source coverage, and code anchors", () => {
    const text = body();
    for (const grade of ["Direct", "Supported", "Inferred", "Speculative", "Unknown"]) {
      expect(text).toContain("| **" + grade + "**");
    }
    for (const source of [
      "source control",
      "issue tracker",
      "long-form documents",
      "team chat",
      "observability",
      "error tracking",
      "analytics",
    ]) {
      expect(text).toContain(source);
    }
    for (const command of ["git blame", "git log --follow", "git log -S", "gh pr view"]) {
      expect(text).toContain(command);
    }
  });

  test("keeps its read-only investigator and debugging handoff", () => {
    expect(body()).toContain("references/investigator.md");
    expect(loadsSkill(body(), "systematic-debugging")).toBe(true);
    expect(body()).not.toContain("git push");
    expect(body()).not.toContain("--force");
    expect(existsSync(REFERENCE)).toBe(true);
    for (const field of [
      "Source",
      "What I Searched",
      "Direct Evidence",
      "Indirect Evidence",
      "Contradictions",
      "Gaps",
      "Additional Leads",
    ]) {
      expect(read(REFERENCE)).toContain("**" + field + "**");
    }
  });

  test("remains wired into its current consumers", () => {
    expect(loadsSkill(read(join(ROOT, "skills", "team-fix", "SKILL.md")), "why")).toBe(true);
    expect(read(join(ROOT, "skills", "reviewing-code", "SKILL.md"))).toMatch(
      /load\s+`why`/,
    );
    for (const consumer of ["systematic-debugging", "authoring-designs"]) {
      expect(read(join(ROOT, "skills", consumer, "SKILL.md"))).toContain("why");
    }
  });
});
