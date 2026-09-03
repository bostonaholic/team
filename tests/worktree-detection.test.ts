// L2 tripwires for the internal WORKTREE module. Its procedure is prompt
// behavior, so tests pin the contract instead of extracting duplicated shell.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { inspectRepo } from "../skills/team-worktree/scripts/inspect-repo.mjs";
import { provisionWorktree } from "../skills/team-worktree/scripts/provision-worktree.mjs";
import { frontmatter, read, squash } from "./helpers/text";

const SKILL = join(process.cwd(), "skills", "team-worktree", "SKILL.md");
const TEAM = join(process.cwd(), "skills", "team", "SKILL.md");
const ARTIFACTS = join(process.cwd(), "skills", "artifact-frontmatter", "SKILL.md");

function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start < 0) return "";
  const end = text.indexOf("\n## ", start + heading.length);
  return text.slice(start, end < 0 ? undefined : end);
}

describe("team-worktree isolation contract", () => {
  test("is hidden and requires an explicit artifact directory", () => {
    const text = read(SKILL);
    expect(frontmatter(text)).toContain("user-invocable: false");
    expect(frontmatter(text)).toContain(
      'argument-hint: "<absolute docs/plans/<id>/ directory>"',
    );
    expect(squash(text)).toContain("Do not search `docs/plans/`");
  });

  test("leaves the durable task record to the coordinator", () => {
    const text = read(SKILL);
    for (const forbidden of [
      "1-task.md",
      "ticketId",
      "workflow:",
      "## Request",
      "dispatch context",
      "supplied request",
    ]) {
      expect(`positive control: ${forbidden}`).toContain(forbidden);
      expect(text).not.toContain(forbidden);
    }
  });

  test("detects linked worktrees through git metadata", () => {
    const text = squash(read(SKILL));
    expect(text).toContain("scripts/inspect-repo.mjs");
    expect(text).toContain("Reuse a linked checkout on a non-default branch");
    expect(text).toContain("Refuse a linked checkout on its default branch");
  });

  test("creates from the remote default and preserves the in-place fallback", () => {
    const text = squash(read(SKILL));
    expect(text).toContain("worktree add .claude/worktrees/<id> -b <id> origin/HEAD");
    expect(text).toContain("record the invoking primary checkout as the fallback");
  });

  test("secondary repositories enforce sibling containment", () => {
    const text = squash(read(SKILL));
    expect(text).toContain("direct child of the home repo's parent");
    expect(text).toContain("refuse any other path before a git write");
  });

  test("falls back per repository and continues the remaining additions", () => {
    const text = squash(read(SKILL));
    expect(text).toContain("record that repo's primary checkout as its resolved fallback path");
    expect(text).toContain("Continue creating worktrees for the remaining repos");
  });

  test("preserves a durable primary artifact home on later calls", () => {
    const text = squash(read(SKILL));
    expect(text).toContain("When `preserveArtifactHome` is true");
    expect(text).toContain("create only missing secondary worktrees");
    expect(text).toContain("must not replace durable artifacts");
  });
});

describe("team WORKTREE dispatch contract", () => {
  test("passes only the artifact path, then writes and verifies 1-task.md", () => {
    const start = section(read(TEAM), "## Start");
    expect(start.length).toBeGreaterThan(0);

    const dispatchStart = start.indexOf("team-worktree");
    const taskWrite = start.indexOf("write `1-task.md`", dispatchStart);
    const taskVerify = start.indexOf("Re-read `1-task.md`", taskWrite);
    expect(dispatchStart).toBeGreaterThanOrEqual(0);
    expect(taskWrite).toBeGreaterThan(dispatchStart);
    expect(taskVerify).toBeGreaterThan(taskWrite);

    const dispatch = start.slice(dispatchStart, taskWrite);
    expect(dispatch).toContain("team-worktree");
    expect(dispatch).toContain("`docs/plans/<id>/` path as `$ARGUMENTS`");
    for (const forbidden of [
      "ticketId",
      "workflow: team",
      "dispatch context",
      "artifactDir",
    ]) {
      expect(`positive control: ${forbidden}`).toContain(forbidden);
      expect(dispatch).not.toContain(forbidden);
    }

    const writeTask = start.slice(taskWrite, taskVerify);
    for (const field of [
      "1-task.md",
      "phase: task",
      "ticketId",
      "workflow: team",
      "## Request",
    ]) {
      expect(writeTask).toContain(field);
    }

    const verifyTask = start.slice(taskVerify);
    expect(verifyTask).toContain("1-task.md");
    expect(verifyTask).toContain("full request");
  });

  test("assigns 1-task.md persistence to the entry coordinators", () => {
    const artifacts = read(ARTIFACTS);
    expect(artifacts).toContain(
      "| Worktree | `1-task.md` | team or team-fix coordinator |",
    );
  });

  test("requires the durable request before WORKTREE can resume", () => {
    const text = read(TEAM);
    const resume = section(text, "## Resume");
    expect(resume.length).toBeGreaterThan(0);
    expect(text).toContain("| WORKTREE | `team-worktree` | `1-task.md` |");
    expect(resume).toContain("valid `1-task.md`");
    expect(resume).toContain("/team <original request>");
  });
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync(
    "git",
    ["-c", "user.email=test@test", "-c", "user.name=test", ...args],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

describe("team-worktree repository inspection", () => {
  let root: string;
  let primary: string;
  let linked: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "team-inspect-repo-"));
    primary = join(root, "repo");
    linked = join(root, "linked");
    mkdirSync(primary);
    git(primary, "init", "-b", "main");
    git(primary, "commit", "--allow-empty", "-m", "init");
    git(primary, "worktree", "add", linked, "-b", "feature-x");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("distinguishes the primary checkout and linked feature worktree", () => {
    expect(inspectRepo(primary)).toMatchObject({
      linked: false,
      primaryRoot: realpathSync(primary),
      branch: "main",
      defaultBranch: "main",
      onDefaultBranch: true,
    });
    expect(inspectRepo(linked)).toMatchObject({
      linked: true,
      primaryRoot: realpathSync(primary),
      branch: "feature-x",
      defaultBranch: "main",
      onDefaultBranch: false,
    });
  });

  test("keeps a primary fallback after the target worktree becomes available", () => {
    const artifactDir = join(primary, "docs", "plans", "feature-x");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(join(artifactDir, "1-task.md"), "durable state\n");

    expect(inspectRepo(primary, artifactDir)).toMatchObject({
      preserveArtifactHome: true,
      primaryRoot: realpathSync(primary),
    });
    expect(inspectRepo(primary, join(primary, "docs", "plans", "missing"))).toMatchObject({
      preserveArtifactHome: false,
    });
    expect(existsSync(join(linked, ".git"))).toBe(true);
  });
});

describe("team-worktree ignored-file provisioning", () => {
  let root: string;
  let primary: string;
  let linked: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "team-provision-worktree-"));
    primary = join(root, "repo");
    linked = join(root, "linked");
    mkdirSync(primary);
    git(primary, "init", "-b", "main");
    writeFileSync(
      join(primary, ".gitignore"),
      ".env\nprivate/\n.secret\n.claude/worktrees/\n",
    );
    writeFileSync(
      join(primary, ".worktreeinclude"),
      ".env\nprivate/**\nvisible.txt\n.claude/**\n",
    );
    writeFileSync(join(primary, "tracked.txt"), "tracked\n");
    git(primary, "add", ".gitignore", ".worktreeinclude", "tracked.txt");
    git(primary, "commit", "-m", "init");
    writeFileSync(join(primary, ".env"), "TOKEN=test\n");
    mkdirSync(join(primary, "private"));
    writeFileSync(join(primary, "private", "config.json"), "{}\n");
    writeFileSync(join(primary, ".secret"), "not selected\n");
    writeFileSync(join(primary, "visible.txt"), "not ignored\n");
    mkdirSync(join(primary, ".claude", "worktrees", "stale"), { recursive: true });
    writeFileSync(join(primary, ".claude", "worktrees", "stale", "state"), "skip\n");
    git(primary, "worktree", "add", linked, "-b", "feature-x");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("copies only include-matched files that the repository ignores", () => {
    expect(provisionWorktree(primary, linked)).toEqual([".env", "private/config.json"]);
    expect(readFileSync(join(linked, ".env"), "utf8")).toBe("TOKEN=test\n");
    expect(readFileSync(join(linked, "private", "config.json"), "utf8")).toBe("{}\n");
    expect(existsSync(join(linked, ".secret"))).toBe(false);
    expect(existsSync(join(linked, "visible.txt"))).toBe(false);
    expect(existsSync(join(linked, ".claude", "worktrees", "stale", "state"))).toBe(false);

    writeFileSync(join(linked, ".env"), "keep existing\n");
    expect(provisionWorktree(primary, linked)).toEqual([]);
    expect(readFileSync(join(linked, ".env"), "utf8")).toBe("keep existing\n");

    rmSync(join(linked, ".env"));
    expect(provisionWorktree(primary, linked)).toEqual([".env"]);
    expect(readFileSync(join(linked, ".env"), "utf8")).toBe("TOKEN=test\n");
  });

  test("rejects a destination-parent symlink before copying", () => {
    const temp = mkdtempSync(join(tmpdir(), "team-provision-symlink-"));
    const repo = join(temp, "repo");
    const worktree = join(temp, "linked");
    const outside = join(temp, "outside");
    mkdirSync(repo);
    mkdirSync(outside);
    git(repo, "init", "-b", "main");
    writeFileSync(join(repo, ".gitignore"), "private/\n");
    writeFileSync(join(repo, ".worktreeinclude"), "private/**\n");
    writeFileSync(join(repo, "tracked.txt"), "tracked\n");
    git(repo, "add", ".gitignore", ".worktreeinclude", "tracked.txt");
    git(repo, "commit", "-m", "init");
    mkdirSync(join(repo, "private"));
    writeFileSync(join(repo, "private", "config.json"), "{}\n");
    git(repo, "worktree", "add", worktree, "-b", "feature-x");
    symlinkSync(outside, join(worktree, "private"));

    try {
      expect(() => provisionWorktree(repo, worktree)).toThrow(
        "unsafe destination symlink",
      );
      expect(existsSync(join(outside, "config.json"))).toBe(false);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
