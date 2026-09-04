// tests/team-fix-skill.test.ts
//
// Fences the branch gate in the `team-fix` RUNTIME skill
// (skills/team-fix/SKILL.md). Two layers, per docs/testing.md:
//
//   L2 tripwire  — the leading WORKTREE phase exists, precedes every commit,
//                  points at the canonical worktree skills, and the Ship step
//                  no longer permits committing wherever HEAD happens to sit.
//   L3 snapshot  — the documented branch-gate shell block is EXTRACTED from
//                  SKILL.md and run against hermetic temp repos, so the
//                  documented command and the tested command cannot drift
//                  (same technique as tests/worktree-detection.test.ts).
//
// Regression fixture for #190: `/team-fix` had no branch or worktree step at
// all, and its Ship step read "If working on a branch, push it … If not on a
// branch, commit to the working branch" — a session sitting on the default
// branch IS on a branch, so the pipeline committed `test:` and `fix:` straight
// to main and pushed, opening no PR.
//
// Every assertion is guarded so a not-yet-existing skill file yields a failed
// expect(), never an uncaught ENOENT — the mechanical gate rejects crashes,
// not clean assertion failures.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { read, squash } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";

const REPO_ROOT = process.cwd();
// team-fix is a RUNTIME skill — under skills/ (distributed), not .claude/.
const SKILL = join(REPO_ROOT, "skills", "team-fix", "SKILL.md");

// Defensive read: missing file → "" so content assertions FAIL (not throw).
function body(): string {
  return existsSync(SKILL) ? read(SKILL) : "";
}

describe("team-fix: the leading WORKTREE phase exists", () => {
  test("skill file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(SKILL)).toBe(true);
  });

  test("the pipeline diagram runs WORKTREE before REPRODUCE", () => {
    const t = body();
    const worktree = t.indexOf("WORKTREE");
    const reproduce = t.indexOf("REPRODUCE");
    expect(worktree).toBeGreaterThanOrEqual(0);
    expect(reproduce).toBeGreaterThan(worktree);
  });

  test("the seeded ledger names Worktree as its first item", () => {
    // The backticked list is a template the skill tells the model to emit.
    expect(body()).toContain(
      "`Worktree → Reproduce → Red (failing test) → Green (minimal fix) → Verify → Ship`",
    );
  });

  test("delegates the worktree procedure to the canonical skills", () => {
    // Load contracts: a rename of either target must fail the build — the
    // sweep in tests/skill-tool-invocation.test.ts resolves every loaded name.
    const s = body();
    expect(loadsSkill(s, "team-worktree")).toBe(true);
    expect(loadsSkill(s, "worktree-isolation")).toBe(true);
  });

  test("branches off origin/HEAD with the documented worktree-add form", () => {
    const s = body();
    expect(s).toContain("git worktree add .claude/worktrees/<id> -b <id> origin/HEAD");
  });

  test("worktree failure falls back to a branch in place, never to the default branch", () => {
    // Isolation is best-effort; the branch is not. The fallback must still
    // switch off the default branch before anything is committed.
    const s = body();
    expect(s).toContain("git switch -c <id>");
  });
});

describe("team-fix: Ship no longer commits wherever HEAD sits", () => {
  test("Ship pushes the feature branch and opens a draft PR", () => {
    const s = body();
    expect(s).toContain("gh pr create --draft");
  });

  test("Ship re-asserts the branch gate before pushing", () => {
    expect(body()).toContain("git rev-parse --abbrev-ref HEAD");
  });

  test("the permissive fallback claim is gone from the whole skill", () => {
    // Negative sweep on a forbidden claim (docs/testing.md): the old wording
    // authorized committing to whatever branch HEAD was on, default included.
    const t = squash(body());
    expect(t.length).toBeGreaterThan(0); // guard: empty body must not pass vacuously
    expect(t).not.toContain("commit to the working branch");
  });
});

// ---------------------------------------------------------------------------
// L3: run the documented branch-gate block against real temp repos.
// ---------------------------------------------------------------------------

// Pull the gate snippet out of the sh code block that resolves the default
// branch (the one naming refs/remotes/origin/HEAD).
function gateSnippet(): string {
  const blocks = [...body().matchAll(/```sh\n([\s\S]*?)```/g)].map((m) => m[1]!);
  const matches = blocks.filter((b) => b.includes("refs/remotes/origin/HEAD"));
  expect(matches.length).toBe(1); // guard: exactly one documented gate block
  return matches[0]!;
}

// The gate prints "on-default" when HEAD is the default branch and
// "ok <branch>" otherwise. Run it with the repo as cwd.
function runGate(repoPath: string): string {
  const res = spawnSync("bash", ["-c", gateSnippet()], {
    cwd: repoPath,
    encoding: "utf8",
  });
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
let originRepo: string; // bare "remote"
let onDefault: string; // clone sitting on the default branch (the bug's state)
let onFeature: string; // clone switched to a feature branch
let noOrigin: string; // repo with no remote at all

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "team-fix-branch-gate-"));

  // A bare origin whose HEAD points at `main`, so clones get origin/HEAD set.
  originRepo = join(root, "origin.git");
  mkdirSync(originRepo);
  git(originRepo, "init", "--bare", "-b", "main");

  const seed = join(root, "seed");
  mkdirSync(seed);
  git(seed, "init", "-b", "main");
  git(seed, "commit", "--allow-empty", "-m", "init");
  git(seed, "remote", "add", "origin", originRepo);
  git(seed, "push", "-u", "origin", "main");

  onDefault = join(root, "on-default");
  git(root, "clone", originRepo, onDefault);

  onFeature = join(root, "on-feature");
  git(root, "clone", originRepo, onFeature);
  git(onFeature, "switch", "-c", "190-team-fix-branch-gate");

  // No remote: origin/HEAD is unresolvable, so the gate falls back to the
  // main/master name check and must still refuse.
  noOrigin = join(root, "no-origin");
  mkdirSync(noOrigin);
  git(noOrigin, "init", "-b", "main");
  git(noOrigin, "commit", "--allow-empty", "-m", "init");
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("team-fix branch gate: executed against real repos", () => {
  test("refuses a checkout sitting on the default branch (the #190 state)", () => {
    expect(runGate(onDefault)).toBe("on-default");
  });

  test("allows a checkout on a feature branch", () => {
    expect(runGate(onFeature)).toBe("ok 190-team-fix-branch-gate");
  });

  test("refuses main even with no origin (origin/HEAD unresolvable)", () => {
    expect(runGate(noOrigin)).toBe("on-default");
  });
});

test("team-fix ships only after the worktree gate and commits", () => {
  const text = body();
  const worktree = text.indexOf("git worktree add");
  const branchGate = text.lastIndexOf("git rev-parse --abbrev-ref HEAD");
  const create = text.lastIndexOf("gh pr create --draft");
  expect(worktree).toBeGreaterThanOrEqual(0);
  expect(branchGate).toBeGreaterThan(worktree);
  expect(create).toBeGreaterThan(branchGate);
});
