// L2 tripwire for the distributed no-comments front door and its
// reviewing-comments methodology. The front door may edit source only after
// a fresh, read-only reviewer classifies the scoped comments.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read, squash } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";

const REPO_ROOT = process.cwd();
const FRONT_DOOR = join(REPO_ROOT, "skills", "no-comments", "SKILL.md");
const METHODOLOGY = join(REPO_ROOT, "skills", "reviewing-comments", "SKILL.md");
const OPENAI_MANIFEST = join(REPO_ROOT, "skills", "no-comments", "agents", "openai.yaml");

function source(path: string): string {
  return existsSync(path) ? read(path) : "";
}

describe("no-comments skill: invocation surface", () => {
  test("front door and methodology are distributed runtime skills", () => {
    expect(existsSync(FRONT_DOOR)).toBe(true);
    expect(existsSync(METHODOLOGY)).toBe(true);
  });

  test("front door is an explicit-only, high-effort command", () => {
    const metadata = frontmatter(source(FRONT_DOOR));
    expect(metadata.length).toBeGreaterThan(0);
    expect(/^name:\s*no-comments\s*$/m.test(metadata)).toBe(true);
    expect(/^argument-hint:/m.test(metadata)).toBe(true);
    expect(/^effort:\s*high\s*$/m.test(metadata)).toBe(true);
    expect(/^disable-model-invocation:\s*true\s*$/m.test(metadata)).toBe(true);
  });

  test("OpenAI manifest disables implicit invocation", () => {
    const manifest = source(OPENAI_MANIFEST);
    expect(manifest.length).toBeGreaterThan(0);
    expect(manifest).toContain("allow_implicit_invocation: false");
  });

  test("reviewing-comments is methodology, not a second command", () => {
    const metadata = frontmatter(source(METHODOLOGY));
    expect(metadata.length).toBeGreaterThan(0);
    expect(/^name:\s*reviewing-comments\s*$/m.test(metadata)).toBe(true);
    expect(/^user-invocable:\s*false\s*$/m.test(metadata)).toBe(true);
    expect(/^argument-hint:/m.test(metadata)).toBe(false);
  });
});

describe("no-comments skill: reviewer separation", () => {
  test("front door loads the shared methodology and execution rules", () => {
    const text = source(FRONT_DOOR);
    for (const dependency of [
      "principle-fix-root-causes",
      "principle-progress-tracking",
      "reviewing-comments",
      "running-quality-checks",
    ]) {
      expect(loadsSkill(text, dependency)).toBe(true);
    }
  });

  test("methodology loads the canonical comment rules", () => {
    expect(loadsSkill(source(METHODOLOGY), "engineering-standards")).toBe(true);
  });

  test("review dispatch uses the built-in read-only Explore agent", () => {
    const frontDoor = source(FRONT_DOOR);
    const methodology = source(METHODOLOGY);
    expect(frontDoor).toContain("subagent_type: Explore");
    expect(frontDoor).toContain("model: opus");
    expect(methodology).toContain("Tools: Read, Grep, Glob");
    expect(existsSync(join(REPO_ROOT, "agents", "comment-reviewer.md"))).toBe(false);
  });

  test("review report uses the action vocabulary", () => {
    const text = source(METHODOLOGY);
    for (const action of ["REMOVE", "KEEP", "ENCODE", "APPROVE", "REQUEST CHANGES"]) {
      expect(text).toContain(action);
    }
  });
});

describe("no-comments skill: scope and mutation gates", () => {
  test("default scope resolves PR base, origin HEAD, then main", () => {
    const text = source(FRONT_DOOR);
    expect(text).toContain("gh pr view");
    expect(text).toContain("--json baseRefName");
    expect(text).toContain("git symbolic-ref refs/remotes/origin/HEAD");
    expect(text).toContain("BASE=main");
    expect(text).toContain("git check-ref-format --branch \"$BASE\"");
    expect(text).toContain("git rev-parse --verify \"refs/remotes/origin/${BASE:?}\"");
    expect(text).toContain("git diff --name-only \"origin/${BASE:?}...HEAD\"");
    expect(text).toContain("git diff --name-only");
    expect(text).toContain("git diff --cached --name-only");
  });

  test("constraint encoding requires an in-run approval", () => {
    const text = source(FRONT_DOOR);
    expect(text).toContain("AskUserQuestion");
    expect(text).toContain("ENCODE");
    expect(text).toContain("KEEP");
  });

  test("an invalid reviewer report gets at most one retry", () => {
    expect(squash(source(FRONT_DOOR))).toContain("Retry limit: 1");
  });
});
