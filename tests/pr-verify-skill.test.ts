import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const ROOT = process.cwd();
const SKILL = join(ROOT, "skills", "pr-verify", "SKILL.md");
const body = () => (existsSync(SKILL) ? read(SKILL) : "");
const metadata = () => (existsSync(SKILL) ? frontmatter(read(SKILL)) : "");

describe("pr-verify skill contract", () => {
  test("keeps its public routing interface", () => {
    const fm = metadata().replace(/\s+/g, " ");
    expect(fm).toMatch(/name:\s*pr-verify/);
    expect(fm).toMatch(/effort:\s*high/);
    expect(fm).toContain('argument-hint: "[<pr-number-or-url>]"');
    for (const trigger of [
      "verify the test plan",
      "check the PR items",
      "is this PR ready",
      "/pr-verify",
    ]) {
      expect(fm).toContain(trigger);
    }
    expect(metadata()).not.toMatch(/^disable-model-invocation:/m);
  });

  test("keeps all input modes and merged-state verification", () => {
    const text = body();
    expect(text).toContain("digits-only PR number or PR URL");
    expect(text).toContain("current branch's PR");
    expect(text).toContain("pasted PR description");
    expect(text).toContain("Closed and merged");
    expect(text).toContain("nothing to verify");
  });

  test("keeps evidence, trust, concurrency, and read-only boundaries", () => {
    const text = body();
    expect(text).toContain("at most four");
    expect(text).toContain("fenced `DATA` block");
    expect(text).toContain("external branch");
    expect(text).toContain("team:file-finder");
    expect(text).toContain("file:line");
    expect(text).not.toContain("git push");
    expect(text).not.toContain("--force");
  });

  test("delegates parsing and verdict calculation to executable helpers", () => {
    expect(body()).toContain("scripts/extract-plan.mjs");
    expect(body()).toContain("scripts/final-verdict.mjs");
    for (const script of ["extract-plan.mjs", "final-verdict.mjs"]) {
      expect(existsSync(join(ROOT, "skills", "pr-verify", "scripts", script))).toBe(true);
    }
  });
});
