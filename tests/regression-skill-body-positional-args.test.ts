// tests/regression-skill-body-positional-args.test.ts
//
// Regression pin for the defect where a skill body carried a bare `$<digit>`
// inside a shell snippet and the slash-command loader ate it.
//
// `$N` in a skill body is not inert. Claude Code substitutes it as shorthand
// for `$ARGUMENTS[N]` — `$0` is the FIRST argument, `$1` the second. So
// `/pr-cleanup PR 244` rewrote pr-cleanup's worktree-path awk from
//
//   awk -v b="refs/heads/$BRANCH" '/^worktree /{w=substr($0,10)} $0=="branch "b{print w; exit}'
//
// to `substr(PR,10)` and `PR=="branch "b` before the model ever read it.
// `PR` is an unset awk variable, so the program matched nothing and printed
// nothing. Every consumer reads an empty `$WORKTREE_PATH` as "the branch lives
// in no worktree, skip this step" — the worktree survived a teardown that
// reported success, and step 3's dirty-tree check inside it never ran.
//
// A placeholder with no corresponding argument is left unchanged, so whether a
// given site breaks depends on how many arguments the caller typed. That makes
// the defect intermittent rather than absent, which is why the fix removes the
// token rather than counting on nobody passing arguments.
//
// Two layers, because each catches what the other cannot:
//
//   1. L2 NEGATIVE SWEEP — no skill body contains `$<digit>` at all. Per
//      docs/testing.md this is a forbidden-pattern tripwire on an identifier,
//      not on a wording, so a meaning-preserving rewrite never turns it red.
//      A positive control proves the matcher can still see the token.
//   2. L3 EXECUTABLE — the pr-cleanup derivation, extracted from the SKILL.md
//      itself, resolves real worktrees in a hermetic fixture repo. Without
//      this, a token-free but broken replacement would sail through layer 1.
//
// The ban is absolute rather than allowing the documented `\$0` backslash
// escape. Team distributes to Claude Code, Codex, and Antigravity; a host that
// substitutes `$N` without implementing the escape leaves a literal `\$0` in
// the body, which is a differently broken command. Avoiding the token is the
// only form that is correct on every host.
//
// Scope is the SKILL.md bodies, which are what a slash-command invocation
// substitutes. Supporting files beside a SKILL.md (prompt templates) are read
// as files, never as the command body, so they are not substituted.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findWorktree } from "../skills/pr-cleanup/scripts/find-worktree.mjs";
import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();

// Every slash-command body in the repo: the distributed plugin's skills plus
// the dev-only ones under .claude/, which are invoked the same way and so are
// substituted the same way.
function skillBodies(): { label: string; path: string }[] {
  const roots = [join("skills"), join(".claude", "skills")];
  const found: { label: string; path: string }[] = [];
  for (const root of roots) {
    const abs = join(REPO_ROOT, root);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs).sort()) {
      const rel = join(root, name, "SKILL.md");
      if (existsSync(join(REPO_ROOT, rel))) {
        found.push({ label: rel, path: join(REPO_ROOT, rel) });
      }
    }
  }
  return found;
}

// `$` followed by a digit — the whole banned family, `$0` through `$9`. Kept
// un-anchored and NON-global: a /g regex carries `lastIndex` between `.test()`
// calls, which would make the per-line scan below skip lines at random.
const POSITIONAL = /\$[0-9]/;

describe("regression: no skill body carries a bare $<digit> the loader would substitute", () => {
  const bodies = skillBodies();

  // Guard: an empty corpus would make every sweep below pass vacuously.
  test("the skill corpus is non-empty", () => {
    expect(bodies.length).toBeGreaterThan(0);
  });

  // Positive control (docs/testing.md, "Prove a negative check can find a
  // positive"): point the matcher at a known offender and watch it fire. A
  // clean sweep is only meaningful once this passes.
  test("the matcher fires on a known positive", () => {
    const planted = `awk '/^worktree /{w=substr($0,10)}'`;
    expect(POSITIONAL.test(planted)).toBe(true);
  });

  for (const { label, path } of bodies) {
    test(`${label} contains no $<digit>`, () => {
      const offenders = read(path)
        .split("\n")
        .map((line, index) => ({ line: index + 1, text: line }))
        .filter((entry) => POSITIONAL.test(entry.text))
        .map((entry) => `${label}:${entry.line}: ${entry.text.trim()}`);
      expect(offenders).toEqual([]);
    });
  }
});

// --- L3: the pr-cleanup helper actually resolves worktrees ------------------

const FIND_WORKTREE = join(
  REPO_ROOT,
  "skills",
  "pr-cleanup",
  "scripts",
  "find-worktree.mjs",
);

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

describe("regression: the pr-cleanup helper resolves worktree paths", () => {
  let root: string;
  let primary: string; // the main working tree, on branch `main`
  let linked: string; // a linked worktree, on a branch whose name holds a `/`

  beforeAll(() => {
    // realpath: on macOS $TMPDIR is a symlink into /private, and git reports
    // the resolved path. Comparing against the unresolved one fails on the
    // symlink, not on the derivation under test.
    root = realpathSync(mkdtempSync(join(tmpdir(), "skill-positional-args-test-")));
    primary = join(root, "repo");
    linked = join(root, "linked");

    mkdirSync(primary);
    git(primary, "init", "-b", "main");
    git(primary, "commit", "--allow-empty", "-m", "init");
    git(primary, "worktree", "add", linked, "-b", "feature/slash-in-name");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function derive(branch: string): string {
    const listing = spawnSync(
      "git",
      ["-C", primary, "worktree", "list", "--porcelain", "-z"],
      { encoding: "utf8" },
    );
    expect(listing.status).toBe(0);
    expect(findWorktree(listing.stdout, branch)).toBe(
      branch === "main"
        ? primary
        : branch === "feature/slash-in-name"
          ? linked
          : "",
    );
    const res = spawnSync("node", [FIND_WORKTREE, "--branch", branch], {
      input: listing.stdout,
      encoding: "utf8",
    });
    expect(res.status).toBe(0);
    return res.stdout;
  }

  test("resolves the primary working tree's own branch", () => {
    expect(derive("main")).toBe(primary);
  });

  // A branch name holding `/` is the case a regex-interpolating rewrite would
  // silently break, so it is pinned rather than left to a plain name.
  test("resolves a linked worktree whose branch name contains a slash", () => {
    expect(derive("feature/slash-in-name")).toBe(linked);
  });

  test("resolves to empty for a branch that lives in no worktree", () => {
    git(primary, "branch", "detached-branch");
    expect(derive("detached-branch")).toBe("");
  });

  test("resolves to empty for a branch that does not exist", () => {
    expect(derive("no-such-branch")).toBe("");
  });

  test("does not match a branch name by prefix", () => {
    // `main` must not answer for `mai` — the comparison is exact, not a prefix
    // or a regex match.
    expect(derive("mai")).toBe("");
  });

  test("rejects missing branch input", () => {
    const result = spawnSync("node", [FIND_WORKTREE], {
      input: "",
      encoding: "utf8",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage:");
  });
});
