// L3 subprocess-snapshot tests (see docs/testing.md §2) for the residue sweep
// documented in skills/worktree-isolation/SKILL.md → "Ship (teardown)". The
// snippet under test is EXTRACTED from the SKILL.md code block — the docs are
// the single source of truth, so the documented command and the tested command
// cannot drift. Real `git` runs against hermetic temp repos; free and
// deterministic.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const ISOLATION = join(REPO_ROOT, "skills", "worktree-isolation", "SKILL.md");

// Pull the sweep snippet out of the teardown section's sh code block (the one
// iterating .claude/worktrees/ against `git worktree list`).
function sweepSnippet(): string {
  const blocks = [...read(ISOLATION).matchAll(/```sh\n([\s\S]*?)```/g)].map((m) => m[1]!);
  const matches = blocks.filter(
    (b) => b.includes(".claude/worktrees/*") && b.includes("worktree list --porcelain"),
  );
  expect(matches.length).toBe(1); // guard: exactly one documented sweep block
  return matches[0]!;
}

function runSweep(repoPath: string): string {
  const script = sweepSnippet().replaceAll("<repo-path>", repoPath);
  return spawnSync("bash", ["-c", script], { encoding: "utf8" }).stdout.trim();
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

function writeFileAt(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

// Re-create a removed worktree path the way a long-lived writer does: absolute
// path + mkdir -p, after `git worktree remove` has already returned 0.
function plantResidue(worktreePath: string): void {
  writeFileAt(join(worktreePath, "tmp", "cache", "bootsnap", "load-path-cache"), "cache\n");
  writeFileAt(join(worktreePath, ".omc", "state", "sessions", "abc123", "state.json"), "{}\n");
}

let root: string;
let repo: string;
let staleWt: string; // removed from git, then re-created by a late writer
let liveWt: string; // still listed by `git worktree list`

beforeEach(() => {
  // realpath: git reports worktree paths physically, so the fixture must too
  // or every path assertion below compares /var against /private/var on macOS.
  root = realpathSync(mkdtempSync(join(tmpdir(), `worktree-sweep-${process.pid}-`)));
  repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, "init", "-b", "main");
  writeFileSync(join(repo, ".gitignore"), "tmp/\n.omc/\ndocs/plans/\n");
  git(repo, "add", ".gitignore");
  git(repo, "commit", "-m", "init");

  staleWt = join(repo, ".claude", "worktrees", "feat-stale");
  git(repo, "worktree", "add", staleWt, "-b", "feat-stale");
  plantResidue(staleWt);

  liveWt = join(repo, ".claude", "worktrees", "feat-live");
  git(repo, "worktree", "add", liveWt, "-b", "feat-live");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("residue sweep (snippet from worktree-isolation SKILL.md)", () => {
  test("`git worktree remove` deletes gitignored files and exits 0 — git is not the culprit", () => {
    git(repo, "worktree", "remove", staleWt);
    expect(existsSync(staleWt)).toBe(false);
  });

  test("sweeps a path a late writer re-created after removal returned", () => {
    git(repo, "worktree", "remove", staleWt);
    plantResidue(staleWt); // the failure mode: recreation lands AFTER the command returns

    const output = runSweep(repo);

    expect(output).toContain(`swept: ${staleWt}`);
    expect(existsSync(staleWt)).toBe(false);
  });

  test("refuses residue holding a file outside tmp/, .omc/, and docs/plans/, and surfaces it", () => {
    git(repo, "worktree", "remove", staleWt);
    plantResidue(staleWt);
    writeFileAt(join(staleWt, "app", "foo.rb"), "class Foo; end\n");

    const output = runSweep(repo);

    expect(output).toContain(`kept (holds unexpected files): ${staleWt}`);
    expect(output).toContain(join(staleWt, "app", "foo.rb")); // surfaced with what it holds
    expect(output).not.toContain(`swept: ${staleWt}`);
    expect(existsSync(join(staleWt, "app", "foo.rb"))).toBe(true);
  });

  test("planning scratch stays disposable — docs/plans/ alone does not block the sweep", () => {
    git(repo, "worktree", "remove", staleWt);
    writeFileAt(join(staleWt, "docs", "plans", "feat-stale", "plan.md"), "# plan\n");

    expect(runSweep(repo)).toContain(`swept: ${staleWt}`);
    expect(existsSync(staleWt)).toBe(false);
  });

  test("never targets a worktree still listed in `git worktree list`, even holding the same junk", () => {
    plantResidue(liveWt);

    const output = runSweep(repo);

    expect(output).not.toContain(liveWt);
    expect(existsSync(liveWt)).toBe(true);
    expect(git(repo, "worktree", "list")).toContain(liveWt);
  });

  test("a stale directory that still carries a .git entry is kept, not deleted", () => {
    // Simulates a checkout git no longer tracks (pruned metadata, moved path):
    // it is not regenerable residue, so it must survive and be reported.
    git(repo, "worktree", "remove", staleWt);
    writeFileAt(join(staleWt, ".git"), "gitdir: /nonexistent\n");

    const output = runSweep(repo);

    expect(output).toContain(`kept (still a checkout): ${staleWt}`);
    expect(existsSync(staleWt)).toBe(true);
  });

  test("reports nothing and deletes nothing when no residue exists", () => {
    git(repo, "worktree", "remove", staleWt);

    expect(runSweep(repo)).toBe("");
    expect(existsSync(liveWt)).toBe(true);
  });
});
