// L3 subprocess-snapshot tests (see TESTING.md §2) for the linked-worktree
// detection documented in skills/team-worktree/SKILL.md. The snippet under
// test is EXTRACTED from the SKILL.md code block — the docs are the single
// source of truth, so the documented command and the tested command cannot
// drift. Real `git` runs against hermetic temp repos; free and deterministic.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const TEAM_WT = join(REPO_ROOT, "skills", "team-worktree", "SKILL.md");

// Pull the detection snippet out of the "## Detect existing worktree"
// section's sh code block (the one comparing --git-dir to --git-common-dir).
function detectionSnippet(): string {
  const text = read(TEAM_WT);
  const blocks = [...text.matchAll(/```sh\n([\s\S]*?)```/g)].map((m) => m[1]);
  const matches = blocks.filter((b) => b.includes("--git-common-dir"));
  expect(matches.length).toBe(1); // guard: exactly one documented detection block
  return matches[0];
}

// Run the documented snippet against a repo path. Detection prints
// "linked worktree" when the checkout is a linked worktree, nothing otherwise.
function runDetection(repoPath: string): string {
  const script = detectionSnippet().replaceAll("<repo-path>", repoPath);
  const res = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  return res.stdout.trim();
}

function git(cwd: string, ...args: string[]): string {
  const res = spawnSync(
    "git",
    ["-c", "user.email=test@test", "-c", "user.name=test", ...args],
    { cwd, encoding: "utf8" },
  );
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${res.stderr}`);
  }
  return res.stdout.trim();
}

let root: string;
let mainRepo: string; // main working tree, branch `main`
let featureWt: string; // linked worktree at an arbitrary user-chosen path
let defaultWt: string; // linked worktree checked out on the default branch
let trickyRepo: string; // MAIN working tree whose path contains /worktrees/

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "worktree-detection-test-"));

  mainRepo = join(root, "repo");
  mkdirSync(mainRepo);
  git(mainRepo, "init", "-b", "main");
  git(mainRepo, "commit", "--allow-empty", "-m", "init");

  // Linked worktree at an arbitrary path — deliberately NOT under
  // .claude/worktrees/ or any path containing "worktrees", to prove the
  // detection is independent of where the user puts worktrees on disk.
  featureWt = join(root, "anywhere", "my-feature");
  git(mainRepo, "worktree", "add", "-b", "feature-x", featureWt);

  // Linked worktree checked out on the default branch (main moved aside
  // first, since a branch can only be checked out in one worktree).
  git(mainRepo, "switch", "-c", "parked");
  defaultWt = join(root, "on-default");
  git(mainRepo, "worktree", "add", defaultWt, "main");

  // Regression fixture for the old substring heuristic: a MAIN working
  // tree whose own path contains /worktrees/ must not read as linked.
  trickyRepo = join(root, "worktrees", "standalone");
  mkdirSync(trickyRepo, { recursive: true });
  git(trickyRepo, "init", "-b", "main");
  git(trickyRepo, "commit", "--allow-empty", "-m", "init");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("linked-worktree detection (snippet from team-worktree SKILL.md)", () => {
  test("main working tree is not detected as linked", () => {
    expect(runDetection(mainRepo)).toBe("");
  });

  test("linked worktree at an arbitrary path is detected", () => {
    expect(runDetection(featureWt)).toBe("linked worktree");
  });

  test("linked worktree on the default branch is still detected (refusal is the branch check's job)", () => {
    expect(runDetection(defaultWt)).toBe("linked worktree");
  });

  test("main working tree whose path contains /worktrees/ is not detected (old heuristic's false positive)", () => {
    expect(runDetection(trickyRepo)).toBe("");
  });
});

describe("branch check inputs for the skip-vs-refuse rule", () => {
  // The documented rule: skip when the linked worktree is on a non-default
  // branch; refuse when it sits on the default branch. Verify the documented
  // command yields the branch names that drive that decision.
  test("feature worktree reports its non-default branch", () => {
    expect(git(featureWt, "rev-parse", "--abbrev-ref", "HEAD")).toBe("feature-x");
  });

  test("default-branch worktree reports the default branch", () => {
    expect(git(defaultWt, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
  });
});
