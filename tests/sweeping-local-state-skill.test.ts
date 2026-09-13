// tests/sweeping-local-state-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `sweeping-local-state` RUNTIME
// teardown procedure (skills/pr-cleanup/playbooks/cleanup.md), the teardown for
// machine-local state a finished PR or a finished review leaves behind —
// provisioned databases, containers, and temp-directory scratch that no git
// command touches.
//
// The contracts pinned here are the ones whose loss is silent:
//
//   - The declaration is read from the DEFAULT BRANCH, never from the working
//     tree or the finished branch. Lose that and a pull request earns code
//     execution on the machine of whoever cleans up after reviewing it.
//   - `sh -c "$line" </dev/null`. Without the redirect a declared command that
//     reads stdin swallows the rest of the declaration out of the loop's pipe,
//     and the remaining lines silently never run.
//   - The temp root has its trailing slashes stripped. macOS `TMPDIR` ends in
//     `/`, so the unstripped prefix pattern matches nothing and every recorded
//     path is refused as "outside the temp root" — a sweep that deletes nothing
//     and reports success.
//   - Both cross-references (pr-cleanup, the worktree playbook) resolve, so a
//     rename of either side fails the build.
//
// Every assertion is guarded so a not-yet-existing file yields a failed
// expect(), never an uncaught ENOENT — the mechanical gate rejects crashes,
// not clean assertion failures.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();
// A RUNTIME playbook — under skills/ (distributed), not .claude/.
const PLAYBOOK = join(REPO_ROOT, "skills", "pr-cleanup", "playbooks", "cleanup.md");
const PR_CLEANUP = join(REPO_ROOT, "skills", "pr-cleanup", "SKILL.md");
const PR_CLEANUP_MODE_B = join(
  REPO_ROOT,
  "skills",
  "pr-cleanup",
  "references",
  "10-mode-b-closed-abandoned.md",
);
const WORKTREE_PLAYBOOK = join(
  REPO_ROOT,
  "skills",
  "team-worktree",
  "playbooks",
  "worktree.md",
);

// Defensive read: missing file → "" so content assertions FAIL (not throw).
function readOrEmpty(path: string): string {
  return existsSync(path) ? read(path) : "";
}
function body(): string {
  return readOrEmpty(PLAYBOOK);
}

describe("cleanup playbook: ordinary-resource contract", () => {
  test("playbook file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(PLAYBOOK)).toBe(true);
  });

  test("playbook is an ordinary file with no skill frontmatter", () => {
    expect(body().startsWith("---\n")).toBe(false);
  });
});

describe("cleanup playbook: the .teamteardown declaration", () => {
  test("names the declaration file at the repo root", () => {
    expect(body()).toContain(".teamteardown");
  });

  test("reads the declaration from origin/<default>, with the local ref as fallback", () => {
    const text = body();
    expect(text).toContain('show "origin/${DEFAULT:?}:.teamteardown"');
    expect(text).toContain('show "refs/heads/${DEFAULT:?}:.teamteardown"');
  });

  test("bans reading the working tree's or the finished branch's copy", () => {
    // The rule that stops a reviewed-but-unlanded branch from executing code
    // on the reviewer's machine. Pinned as a hard rule, not as prose.
    expect(body()).toMatch(
      /Never read `\.teamteardown` from the working tree or from the finished\s+branch/,
    );
  });

  test("passes values through the environment under the three TEAM_ names", () => {
    const text = body();
    expect(text).toContain("TEAM_REPO_ROOT");
    expect(text).toContain("TEAM_BRANCH");
    expect(text).toContain("TEAM_WORKTREE");
  });

  test("runs each declared line verbatim, never edited or interpolated", () => {
    expect(body()).toMatch(/Never edit, re-quote, or interpolate a declared line/);
  });

  test("guards PRIMARY_ROOT and DEFAULT as standalone statements, not inside $( )", () => {
    // A `:?` that fires inside a command substitution kills only the subshell.
    // The assignment then completes empty and the run reports "nothing
    // declared" for a repo that declared plenty.
    const text = body();
    expect(text).toContain(': "${PRIMARY_ROOT:?refusing: primary clone unresolved}"');
    expect(text).toContain(': "${DEFAULT:?refusing: default branch unresolved}"');
  });

  test("the run block keeps the local-ref fallback, not just origin/", () => {
    expect(body()).toContain(
      'git -C "$PRIMARY_ROOT" show "refs/heads/$DEFAULT:.teamteardown"',
    );
  });

  test("redirects the declared command's stdin from /dev/null", () => {
    // Without this the command eats the rest of the declaration out of the
    // loop's pipe and the remaining lines never run.
    expect(body()).toContain('sh -c "$line" </dev/null');
  });

  test("an absent declaration runs nothing and is reported, not inferred", () => {
    const text = body();
    expect(text).toMatch(/Never invent a teardown command/);
    expect(text).toContain("No .teamteardown on <default> — nothing declared.");
  });
});

describe("cleanup playbook: temp-path sweep guards", () => {
  test("strips trailing slashes off the temp root before the prefix test", () => {
    // macOS TMPDIR ends in "/", so the unstripped pattern matches nothing.
    expect(body()).toContain('while [ "${TMPROOT%/}" != "$TMPROOT" ]');
  });

  test("refuses a path outside the temp root, containing .., or via a symlink", () => {
    const text = body();
    expect(text).toContain('"$TMPROOT"/?*');
    expect(text).toContain("case \"$P\" in *..*)");
    expect(text).toContain('[ -L "$P" ]');
  });

  test("the removal sink aborts on an unset path", () => {
    expect(body()).toContain('rm -rf "${P:?}"');
  });

  test("forbids a wildcard sweep of the temp directory", () => {
    expect(body()).toMatch(/Never wildcard-sweep the temp directory/);
  });
});

describe("cleanup playbook: ownership boundary and cross-references", () => {
  test("disclaims the state its callers already own", () => {
    const text = body();
    expect(text).toContain("## Ownership boundary");
    expect(text).toMatch(/Never re-run a step the caller owns/);
  });

  test("carries the reviewer-side section its callers skip", () => {
    expect(body()).toContain("## Finishing a review rather than a merge");
  });

  test("pr-cleanup loads it, and names the section to skip", () => {
    const text = readOrEmpty(PR_CLEANUP_MODE_B);
    expect(text).toContain("skills/pr-cleanup/playbooks/cleanup.md");
    expect(text).toContain("Finishing a review rather than a merge");
  });

  test("pr-cleanup no longer asks the user to name a teardown command", () => {
    expect(readOrEmpty(PR_CLEANUP)).not.toContain("External-state ask");
  });

  test("worktree playbook teardown loads it as its final step", () => {
    const text = readOrEmpty(WORKTREE_PLAYBOOK);
    expect(text).toContain("skills/pr-cleanup/playbooks/cleanup.md");
    expect(text).toContain(".teamteardown");
  });
});
