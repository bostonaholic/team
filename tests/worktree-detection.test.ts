import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { inspectRepo } from "../skills/team-worktree/scripts/inspect-repo.mjs";

const SCRIPT = join(
  import.meta.dir,
  "..",
  "skills",
  "team-worktree",
  "scripts",
  "inspect-repo.mjs",
);

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync(
    "git",
    ["-c", "user.email=test@test", "-c", "user.name=test", ...args],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

let root: string;
let mainRepo: string;
let featureWorktree: string;
let defaultWorktree: string;
let trickyRepo: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "worktree-detection-test-"));
  mainRepo = join(root, "repo");
  mkdirSync(mainRepo);
  git(mainRepo, "init", "-b", "main");
  git(mainRepo, "commit", "--allow-empty", "-m", "init");

  featureWorktree = join(root, "anywhere", "my-feature");
  git(mainRepo, "worktree", "add", "-b", "feature-x", featureWorktree);
  git(mainRepo, "switch", "-c", "parked");
  defaultWorktree = join(root, "on-default");
  git(mainRepo, "worktree", "add", defaultWorktree, "main");

  trickyRepo = join(root, "worktrees", "standalone");
  mkdirSync(trickyRepo, { recursive: true });
  git(trickyRepo, "init", "-b", "main");
  git(trickyRepo, "commit", "--allow-empty", "-m", "init");
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("repository inspection", () => {
  test("distinguishes main checkouts from linked worktrees by git metadata", () => {
    expect(inspectRepo(mainRepo)).toMatchObject({
      linked: false,
      branch: "parked",
      defaultBranch: "main",
      onDefaultBranch: false,
    });
    expect(inspectRepo(featureWorktree)).toMatchObject({
      linked: true,
      branch: "feature-x",
      onDefaultBranch: false,
    });
    expect(inspectRepo(defaultWorktree)).toMatchObject({
      linked: true,
      branch: "main",
      onDefaultBranch: true,
    });
  });

  test("does not classify a main checkout by path text", () => {
    expect(inspectRepo(trickyRepo)).toMatchObject({
      linked: false,
      branch: "main",
      onDefaultBranch: true,
    });
  });

  test("CLI returns structured output and treats the repo path as argv data", () => {
    const result = spawnSync("node", [SCRIPT, "--repo", trickyRepo], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      repo: trickyRepo,
      linked: false,
      onDefaultBranch: true,
    });
  });

  test("resolves a primary checkout whose path contains newline and trailing space", () => {
    const unusualRoot = mkdtempSync(join(tmpdir(), "worktree-primary-path-"));
    const primary = join(unusualRoot, "repo\nwith trailing space ");
    const linked = join(unusualRoot, "linked");
    mkdirSync(primary);
    git(primary, "init", "-b", "main");
    git(primary, "commit", "--allow-empty", "-m", "init");
    git(primary, "worktree", "add", "-b", "feature", linked);

    try {
      expect(inspectRepo(linked).primaryRoot).toBe(realpathSync(primary));
    } finally {
      rmSync(unusualRoot, { recursive: true, force: true });
    }
  });
});
