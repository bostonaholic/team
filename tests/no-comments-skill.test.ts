// L2 tripwire for the distributed no-comments front door and its
// reviewing-comments methodology. The front door may edit source only after
// a fresh, read-only reviewer classifies the scoped comments.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { frontmatter, read, squash } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";

const REPO_ROOT = process.cwd();
const FRONT_DOOR = join(REPO_ROOT, "skills", "no-comments", "SKILL.md");
const METHODOLOGY = join(REPO_ROOT, "skills", "reviewing-comments", "SKILL.md");
const OPENAI_MANIFEST = join(REPO_ROOT, "skills", "no-comments", "agents", "openai.yaml");
const CHANGED_FILES = join(REPO_ROOT, "skills", "no-comments", "scripts", "changed-files.sh");

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
    const frontDoor = source(FRONT_DOOR);
    const text = source(CHANGED_FILES);
    expect(frontDoor).toContain("scripts/changed-files.sh");
    expect(frontDoor).not.toContain("git diff --name-only");
    expect(existsSync(CHANGED_FILES)).toBe(true);
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

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync(
    "git",
    ["-c", "user.email=test@test", "-c", "user.name=test", ...args],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

let scopeRoot: string;
let scopeRepo: string;
let fakeBin: string;

beforeAll(() => {
  scopeRoot = mkdtempSync(join(tmpdir(), `no-comments-scope-${process.pid}-`));
  const origin = join(scopeRoot, "origin.git");
  mkdirSync(origin);
  git(origin, "init", "--bare", "-b", "main");

  const seed = join(scopeRoot, "seed");
  mkdirSync(seed);
  git(seed, "init", "-b", "main");
  writeFileSync(join(seed, "modified.txt"), "base\n");
  git(seed, "add", "modified.txt");
  git(seed, "commit", "-m", "base");
  git(seed, "remote", "add", "origin", origin);
  git(seed, "push", "-u", "origin", "main");

  scopeRepo = join(scopeRoot, "work");
  git(scopeRoot, "clone", origin, scopeRepo);
  git(scopeRepo, "switch", "-c", "feature");
  writeFileSync(join(scopeRepo, "committed.txt"), "committed\n");
  git(scopeRepo, "add", "committed.txt");
  git(scopeRepo, "commit", "-m", "feature");
  writeFileSync(join(scopeRepo, "staged.txt"), "staged\n");
  git(scopeRepo, "add", "staged.txt");
  writeFileSync(join(scopeRepo, "modified.txt"), "changed\n");

  fakeBin = join(scopeRoot, "bin");
  mkdirSync(fakeBin);
  writeFileSync(join(fakeBin, "gh"), "#!/usr/bin/env bash\nexit 1\n");
  chmodSync(join(fakeBin, "gh"), 0o755);
});

afterAll(() => {
  if (scopeRoot) rmSync(scopeRoot, { recursive: true, force: true });
});

describe("no-comments changed-files helper", () => {
  test("prints the sorted union of committed, staged, and unstaged files", () => {
    const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ""}` };
    const result = spawnSync(CHANGED_FILES, [], {
      cwd: scopeRepo,
      encoding: "utf8",
      env,
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n")).toEqual([
      "committed.txt",
      "modified.txt",
      "staged.txt",
    ]);
  });

  test("rejects arguments", () => {
    const result = spawnSync(CHANGED_FILES, ["main"], { encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("usage:");
  });
});
