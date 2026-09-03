import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { provisionIgnoredFiles } from "../skills/team-worktree/scripts/create-worktrees.mjs";

const SCRIPT = join(
  import.meta.dir,
  "..",
  "skills",
  "team-worktree",
  "scripts",
  "create-worktrees.mjs",
);

setDefaultTimeout(15_000);

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync(
    "git",
    ["-c", "user.email=test@test", "-c", "user.name=test", ...args],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function initRepo(path: string, included: string): void {
  mkdirSync(path);
  git(path, "init", "-b", "main");
  write(
    join(path, ".gitignore"),
    ".claude/worktrees/\n.env\n..env\n.token\nconfig/\nignored-only.txt\n",
  );
  write(join(path, ".worktreeinclude"), included);
  write(join(path, "tracked-declared.txt"), "committed\n");
  git(path, "add", ".gitignore", ".worktreeinclude", "tracked-declared.txt");
  git(path, "commit", "-m", "init");
}

describe("team-worktree ignored-file provisioning", () => {
  test("copies only each repo's declared ignored files at their relative paths", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-provisioning-"));
    const firstRepo = join(root, "first");
    const secondRepo = join(root, "second");
    const branch = "feature-work";
    initRepo(
      firstRepo,
      ".env\n..env\nconfig/*.key\nunignored-declared.txt\ntracked-declared.txt\n",
    );
    initRepo(secondRepo, ".token\n");
    write(join(firstRepo, ".env"), "first env\n");
    write(join(firstRepo, "..env"), "legal dotdot prefix\n");
    write(join(firstRepo, ".token"), "first token\n");
    write(join(firstRepo, "config", "secret.key"), "secret\n");
    write(join(firstRepo, "config", "omitted.txt"), "omit\n");
    write(join(firstRepo, "ignored-only.txt"), "ignored\n");
    write(join(firstRepo, "unignored-declared.txt"), "unignored\n");
    write(join(firstRepo, "tracked-declared.txt"), "modified\n");
    write(join(secondRepo, ".env"), "second env\n");
    write(join(secondRepo, ".token"), "second token\n");

    try {
      const result = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          branch,
          "--home",
          firstRepo,
          "--target",
          "first",
          firstRepo,
          "--target",
          "second",
          secondRepo,
        ],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      const outcomes = JSON.parse(result.stdout);
      expect(outcomes).toMatchObject([
        {
          name: "first",
          status: "created",
          copied: ["..env", ".env", "config/secret.key"],
        },
        { name: "second", status: "created", copied: [".token"] },
      ]);

      const firstWorktree = join(firstRepo, ".claude", "worktrees", branch);
      const secondWorktree = join(secondRepo, ".claude", "worktrees", branch);
      expect(readFileSync(join(firstWorktree, ".env"), "utf8")).toBe("first env\n");
      expect(readFileSync(join(firstWorktree, "..env"), "utf8")).toBe(
        "legal dotdot prefix\n",
      );
      expect(readFileSync(join(firstWorktree, "config", "secret.key"), "utf8")).toBe(
        "secret\n",
      );
      expect(readFileSync(join(firstWorktree, "tracked-declared.txt"), "utf8")).toBe(
        "committed\n",
      );
      expect(existsSync(join(firstWorktree, ".token"))).toBe(false);
      expect(existsSync(join(firstWorktree, "config", "omitted.txt"))).toBe(false);
      expect(existsSync(join(firstWorktree, "ignored-only.txt"))).toBe(false);
      expect(existsSync(join(firstWorktree, "unignored-declared.txt"))).toBe(false);
      expect(readFileSync(join(secondWorktree, ".token"), "utf8")).toBe("second token\n");
      expect(existsSync(join(secondWorktree, ".env"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("does not copy primary-checkout files over a reused worktree", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-reuse-"));
    const repo = join(root, "repo");
    const branch = "feature-work";
    initRepo(repo, ".env\n");
    write(join(repo, ".env"), "original\n");

    try {
      const first = spawnSync(
        "node",
        [SCRIPT, "--branch", branch, "--home", repo, "--target", "repo", repo],
        { encoding: "utf8" },
      );
      expect(first.status).toBe(0);
      write(join(repo, ".env"), "changed\n");
      const artifactDir = join(
        repo,
        ".claude",
        "worktrees",
        branch,
        "docs",
        "plans",
        branch,
      );
      mkdirSync(artifactDir, { recursive: true });

      const second = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          branch,
          "--home",
          repo,
          "--preserve-existing-home",
          artifactDir,
          "--target",
          "repo",
          repo,
        ],
        { encoding: "utf8" },
      );
      expect(second.status).toBe(0);
      expect(JSON.parse(second.stdout)).toMatchObject([
        { name: "repo", status: "reused", copied: [] },
      ]);
      expect(
        readFileSync(join(repo, ".claude", "worktrees", branch, ".env"), "utf8"),
      ).toBe("original\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("continues other repos after provisioning failure without recopying on reuse", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-provision-failure-"));
    const failedRepo = join(root, "failed");
    const healthyRepo = join(root, "healthy");
    const branch = "feature-work";
    initRepo(failedRepo, ".env\n");
    initRepo(healthyRepo, ".token\n");
    write(join(failedRepo, ".env"), "failed env\n");
    write(join(healthyRepo, ".token"), "healthy token\n");

    try {
      const include = join(failedRepo, ".worktreeinclude");
      Bun.spawnSync(["chmod", "000", include]);
      const first = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          branch,
          "--home",
          failedRepo,
          "--target",
          "failed",
          failedRepo,
          "--target",
          "healthy",
          healthyRepo,
        ],
        { encoding: "utf8" },
      );

      expect(first.status).toBe(2);
      const outcomes = JSON.parse(first.stdout);
      expect(outcomes).toMatchObject([
        {
          name: "failed",
          status: "provisioning-failed",
          worktreeStatus: "created",
        },
        { name: "healthy", status: "created", copied: [".token"] },
      ]);

      Bun.spawnSync(["chmod", "644", include]);
      const second = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          branch,
          "--home",
          failedRepo,
          "--target",
          "failed",
          failedRepo,
        ],
        { encoding: "utf8" },
      );
      expect(second.status).toBe(0);
      expect(JSON.parse(second.stdout)).toMatchObject([
        { name: "failed", status: "reused", copied: [] },
      ]);
      expect(
        existsSync(join(failedRepo, ".claude", "worktrees", branch, ".env")),
      ).toBe(false);
    } finally {
      Bun.spawnSync(["chmod", "644", join(failedRepo, ".worktreeinclude")]);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a destination-parent symlink before copying", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-provision-symlink-"));
    const repo = join(root, "repo");
    const linked = join(root, "linked");
    const outside = join(root, "outside");
    initRepo(repo, "config/*.key\n");
    write(join(repo, "config", "secret.key"), "secret\n");
    mkdirSync(outside);
    git(repo, "worktree", "add", linked, "-b", "feature-work");
    symlinkSync(outside, join(linked, "config"));

    try {
      expect(() => provisionIgnoredFiles(repo, linked)).toThrow(
        "unsafe destination symlink",
      );
      expect(existsSync(join(outside, "secret.key"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
