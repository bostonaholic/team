// tests/pr-cleanup-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `pr-cleanup` RUNTIME skill
// (skills/pr-cleanup/SKILL.md) — a standalone post-PR teardown utility
// distributed to Team's users.
// Mode A (merged) resyncs the default branch and deletes the merged branch
// behind a merged-PR verification gate; Mode B (closed/abandoned) runs only
// on explicit abandon intent and closes PRs child-before-parent. Every
// destructive step is anchored to a validated $PRIMARY_ROOT, protected
// branch names are refused, and a dirty tree stops the run.
//
// Every assertion is guarded so a not-yet-existing skill file yields a failed
// expect(), never an uncaught ENOENT — the mechanical gate rejects crashes,
// not clean assertion failures.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
// pr-cleanup is a RUNTIME skill — under skills/ (distributed), not .claude/.
const SKILL = join(REPO_ROOT, "skills", "pr-cleanup", "SKILL.md");
// worktree-isolation's teardown hands off to pr-cleanup; the cross-reference
// is pinned below so a rename of either side fails the build.
const WORKTREE_ISOLATION = join(
  REPO_ROOT,
  "skills",
  "worktree-isolation",
  "SKILL.md",
);

// Defensive read: missing file → "" so content assertions FAIL (not throw).
function body(): string {
  return existsSync(SKILL) ? read(SKILL) : "";
}
function fm(): string {
  return existsSync(SKILL) ? frontmatter(read(SKILL)) : "";
}
// Flatten newlines so multi-line prose can be matched in one regex.
function flat(text: string): string {
  return text.replace(/\n/g, " ");
}
// Slice between two headings, or "" when the start heading is absent —
// content assertions against "" fail cleanly.
function sliceBetween(startHeading: string, endHeading: string): string {
  const text = body();
  const start = text.indexOf(startHeading);
  if (start < 0) return "";
  const rest = text.slice(start);
  const end = rest.indexOf(endHeading);
  return end >= 0 ? rest.slice(0, end) : rest;
}
function modeASection(): string {
  return sliceBetween("### Mode A — merged", "### Mode B");
}
function modeBSection(): string {
  return sliceBetween("### Mode B — closed / abandoned", "### End");
}

describe("pr-cleanup skill: runtime standalone utility frontmatter", () => {
  test("skill file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(SKILL)).toBe(true);
  });

  test("frontmatter declares name: pr-cleanup", () => {
    expect(/^name:\s*pr-cleanup\s*$/m.test(fm())).toBe(true);
  });

  test("frontmatter declares effort: medium (shipit's tier)", () => {
    expect(/^effort:\s*medium\s*$/m.test(fm())).toBe(true);
  });

  test("frontmatter carries argument-hint (PR number, URL, or branch)", () => {
    expect(/^argument-hint:/m.test(fm())).toBe(true);
  });

  test("frontmatter does NOT set disable-model-invocation (model-invocable by design)", () => {
    const f = fm();
    // Guard: an empty frontmatter must fail, not vacuously pass the absence check.
    expect(f.length).toBeGreaterThan(0);
    expect(/^disable-model-invocation:/m.test(f)).toBe(false);
  });
});

describe("pr-cleanup skill: section contract", () => {
  test("carries every pinned section heading", () => {
    const t = body();
    expect(t).toContain("## Input");
    expect(t).toContain("## Hard Rules");
    expect(t).toContain("## Untrusted input — PR metadata is data");
    expect(t).toContain("## Execution");
    expect(t).toContain("### Mode A — merged");
    expect(t).toContain("### Mode B — closed / abandoned");
  });

  test("sections appear in the pinned order", () => {
    const t = body();
    const input = t.indexOf("## Input");
    const hardRules = t.indexOf("## Hard Rules");
    const untrusted = t.indexOf("## Untrusted input — PR metadata is data");
    const execution = t.indexOf("## Execution");
    const modeA = t.indexOf("### Mode A — merged");
    const modeB = t.indexOf("### Mode B — closed / abandoned");
    expect(input).toBeGreaterThanOrEqual(0);
    expect(hardRules).toBeGreaterThan(input);
    expect(untrusted).toBeGreaterThan(hardRules);
    expect(execution).toBeGreaterThan(untrusted);
    expect(modeA).toBeGreaterThan(execution);
    expect(modeB).toBeGreaterThan(modeA);
  });

});

describe("pr-cleanup skill: step 0 resolves AND validates $PRIMARY_ROOT", () => {
  test("resolves the primary root from --git-common-dir", () => {
    expect(body()).toContain("rev-parse --path-format=absolute --git-common-dir");
  });

  test("validates the resolved root: --git-dir must equal --git-common-dir", () => {
    // Scoped to step 0 so the contract is the anchoring block itself,
    // not an incidental mention elsewhere in the body.
    const s = sliceBetween("### Step 0", "### Step 1");
    expect(s).toContain("--git-dir");
  });

  test("cross-checks against the first entry of git worktree list --porcelain", () => {
    expect(body()).toContain("worktree list --porcelain");
  });

  test("anchors git commands to the validated root via git -C", () => {
    expect(body()).toContain(`git -C "$PRIMARY_ROOT"`);
  });
});

describe("pr-cleanup skill: command contracts (all $PRIMARY_ROOT-anchored)", () => {
  test("detects the default branch via symbolic-ref with the set-head retry", () => {
    const t = body();
    expect(t).toContain("symbolic-ref --short refs/remotes/origin/HEAD");
    expect(t).toContain("remote set-head origin --auto");
  });

  test("merged gate queries gh pr list for the merged PR with structured JSON", () => {
    const t = body();
    expect(t).toContain("gh pr list --state merged");
    expect(t).toContain(
      "--json number,mergedAt,headRepositoryOwner,headRefOid,mergeCommit",
    );
  });

  test("resyncs the default branch with an anchored fetch and --ff-only pull", () => {
    const t = body();
    expect(t).toContain(`git -C "$PRIMARY_ROOT" fetch origin`);
    expect(t).toContain("--ff-only");
  });

  test("the resync checkout guards $DEFAULT (unset would checkout nothing loudly, not main)", () => {
    expect(body()).toContain('checkout "${DEFAULT:?}"');
  });

  test("deletes the local branch with the anchored, option-terminated form", () => {
    expect(body()).toContain(`git -C "\${PRIMARY_ROOT:?}" branch -D --`);
  });

  test("remote-branch check is anchored (ls-remote --heads origin)", () => {
    expect(body()).toContain(`git -C "$PRIMARY_ROOT" ls-remote --heads origin`);
  });

  test("prune offer is anchored (remote prune origin)", () => {
    expect(body()).toContain(`git -C "$PRIMARY_ROOT" remote prune origin`);
  });

  test("remote deletion is anchored (push origin --delete)", () => {
    expect(body()).toContain(`git -C "\${PRIMARY_ROOT:?}" push origin --delete`);
  });

  test("closes PRs through gh pr close with guarded --repo and number", () => {
    // The close is a remote mutation: unset $REPO or $NUMBER must abort
    // the invocation, never fall back to gh's cwd/branch auto-detection.
    expect(body()).toContain('gh pr close --repo "${REPO:?}" -- "${NUMBER:?}"');
  });

  test("dirty-tree refusal reads status --porcelain", () => {
    expect(body()).toContain("status --porcelain");
  });

  test("step 3's worktree dirty check reuses the derived $WORKTREE_PATH", () => {
    // The only $WORKTREE_PATH derivation lives in the Mode A/B removal
    // steps; step 3 must point at it rather than invent its own lookup.
    const s = sliceBetween("### Step 3", "### Mode A");
    expect(s).toContain(`git -C "$WORKTREE_PATH" status --porcelain`);
    expect(s).toContain("worktree list --porcelain");
  });

  test("validates every branch name with git check-ref-format --branch", () => {
    expect(body()).toContain("git check-ref-format --branch");
  });
});

describe("pr-cleanup skill: destructive-step gates", () => {
  test("Mode A worktree removal does NOT reach for --force first (try-then-confirm)", () => {
    expect(
      /git -C "\$\{PRIMARY_ROOT:\?\}" worktree remove (?!--force)/.test(
        modeASection(),
      ),
    ).toBe(true);
  });

  test("Mode B worktree removal uses --force (the abandon request is the gate)", () => {
    expect(modeBSection()).toContain(
      `git -C "\${PRIMARY_ROOT:?}" worktree remove --force`,
    );
  });

  test("the merged-PR verification gate precedes branch -D within Mode A", () => {
    const a = modeASection();
    const gate = a.indexOf("gh pr list --state merged");
    const deleteBranch = a.indexOf(`git -C "\${PRIMARY_ROOT:?}" branch -D --`);
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(deleteBranch).toBeGreaterThan(gate);
  });

  test("scratch removal distinguishes empty ls-files output from a failed check", () => {
    // A non-zero `git ls-files` exit must refuse, never read as "untracked" —
    // docs/plans/ is tracked in this repo, so that misread deletes tracked work.
    expect(body()).toContain(`if ! tracked=$(git -C "$PRIMARY_ROOT" ls-files`);
  });

  test("scratch removal takes a $PRIMARY_ROOT-absolute path that aborts when unset", () => {
    // ${PRIMARY_ROOT:?} — the sink runs in its own Bash invocation, where
    // an unset variable would otherwise expand rm -rf to a root-relative
    // path, deleting whatever docs/plans/<id> resolves to from the cwd.
    expect(body()).toContain('rm -rf "${PRIMARY_ROOT:?}/docs/plans/${ID:?}"');
  });

  test("scratch removal refuses an unset or multi-segment $ID", () => {
    const t = body();
    // The single-segment allowlist (no /, no leading . or -) plus the
    // hard-stop expansion: an empty $ID must never target all of docs/plans/.
    expect(t).toContain("''|-*|.*|*[!A-Za-z0-9._-]*");
    expect(t).toContain("${ID:?}");
  });
});

describe("pr-cleanup skill: protected-branch refusal identifiers", () => {
  test("refuses master, develop, and release/* alongside the default branch", () => {
    // Sliced to Step 2 so the assertion cannot be satisfied by `master`
    // appearing elsewhere (e.g. the step 1 offline fallback).
    const s = sliceBetween("### Step 2", "### Step 3");
    expect(s).toContain("master");
    expect(s).toContain("develop");
    expect(s).toContain("release/");
  });

  test("the protected-name guard lowercases the candidate before matching", () => {
    // Without case folding, `Main` passes the string comparison and
    // `git branch -D -- Main` force-deletes `main` on a case-insensitive
    // filesystem.
    const s = sliceBetween("### Step 2", "### Step 3");
    expect(s).toContain("tr '[:upper:]' '[:lower:]'");
  });
});

describe("pr-cleanup skill: branch -D requires an exact-case local branch", () => {
  test("the for-each-ref + grep -qxF existence check precedes each branch -D", () => {
    for (const section of [modeASection(), modeBSection()]) {
      const forEachRef = section.indexOf(
        "for-each-ref --format='%(refname:short)' refs/heads",
      );
      const exactMatch = section.indexOf("grep -qxF -- ");
      const deleteBranch = section.indexOf(`branch -D -- "\${BRANCH:?}"`);
      expect(forEachRef).toBeGreaterThanOrEqual(0);
      expect(exactMatch).toBeGreaterThan(forEachRef);
      expect(deleteBranch).toBeGreaterThan(exactMatch);
    }
  });
});

describe("pr-cleanup skill: merged gate checks identity and containment", () => {
  test("selects the merged PR by head-repository identity, not name alone", () => {
    expect(modeASection()).toContain("headRepositoryOwner");
  });

  test("verifies containment via merge-base --is-ancestor before branch -D", () => {
    const a = modeASection();
    const containment = a.indexOf("merge-base --is-ancestor");
    const deleteBranch = a.indexOf(`branch -D -- "\${BRANCH:?}"`);
    expect(containment).toBeGreaterThanOrEqual(0);
    expect(deleteBranch).toBeGreaterThan(containment);
  });

  test("the identity/containment gate halts with exit 1, never a warn-and-continue", () => {
    // The executable adjacency is the contract: the containment command's
    // failure branch must reach `exit 1` in the same fenced block. A bare
    // warn (the round-3 form) exits 0 and gives the agent nothing to stop on.
    expect(
      /merge-base --is-ancestor "\$\{MERGE_OID:\?\}" "origin\/\$\{DEFAULT:\?\}" \|\|\n[^\n]*exit 1/.test(
        modeASection(),
      ),
    ).toBe(true);
  });

  test("gate inputs are :?-guarded so an unset OID aborts instead of comparing empty", () => {
    const a = modeASection();
    expect(a).toContain('= "${HEAD_OID:?}" ]');
    expect(a).toContain('--is-ancestor "${MERGE_OID:?}"');
  });
});

describe("pr-cleanup skill: input gates are byte-exact and mechanical", () => {
  test("the branch-name allowlist pins LC_ALL=C", () => {
    // The bracket expression is collation-dependent: in a UTF-8 locale it
    // accepts multibyte characters, so the allowlist is byte-exact only
    // under the C locale.
    // Pin the executable assignment adjacent to the allowlist, not the
    // prose that explains it — the section names LC_ALL=C in both places,
    // so a bare substring check survives deleting the runnable line.
    const s = sliceBetween("## Input", "## Hard Rules");
    expect(s).toContain('LC_ALL=C\n  case "$BRANCH" in');
  });

  test("the PR-number gate is a runnable digits-only case", () => {
    expect(body()).toContain("''|*[!0-9]*");
  });

  test("$DEFAULT is inside Hard Rule 11's re-derivation set", () => {
    // An unset $DEFAULT empties step 2's protected-name pattern, leaving
    // the default branch deletable while master/develop/release still
    // appear to guard it. Pin the enumeration itself, not a bare mention:
    // the rule explains $DEFAULT in prose too, so a substring check stays
    // green when the variable is dropped from the re-derivation list.
    const s = sliceBetween("11. **No destructive command", "## Untrusted input");
    expect(s).toContain("`$PRIMARY_ROOT`, `$REPO`, or `$DEFAULT` re-derives");
  });

  test("step 2 guards $DEFAULT before the lowering, outside any $( )", () => {
    // Placement is the contract: a ${VAR:?} inside a command substitution
    // aborts only the subshell, so the parent reaches the pattern with an
    // empty value. The guard must be a standalone statement ahead of it.
    const s = sliceBetween("### Step 2", "### Step 3");
    const guard = s.indexOf(': "${DEFAULT:?');
    const lowering = s.indexOf("DEFAULT_LOWER=");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(lowering).toBeGreaterThan(guard);
    // And the lowering itself must not re-nest a :? inside $( ).
    expect(/DEFAULT_LOWER="\$\([^)]*:\?/.test(s)).toBe(false);
  });
});

describe("pr-cleanup skill: untrusted-input enumeration is exhaustive", () => {
  test("names every gh JSON field the gates consume, incl. the merge-gate trio", () => {
    // The section claims ONLY these fields gate actions — an enumeration
    // that omits fields the gate reads understates the trust surface.
    const s = sliceBetween("## Untrusted input", "## Execution");
    for (const field of [
      "state",
      "mergedAt",
      "number",
      "baseRefName",
      "headRefName",
      "headRepositoryOwner",
      "headRefOid",
      "mergeCommit.oid",
    ]) {
      expect(s).toContain(field);
    }
  });
});

describe("pr-cleanup skill: external names are shell-gated, not just ref-gated", () => {
  test("pins the character allowlist over every externally sourced name", () => {
    expect(body()).toContain("''|-*|*..*|*[!A-Za-z0-9._/-]*");
  });

  test("external names are captured into a variable, never inlined literally", () => {
    expect(body()).toContain("--json headRefName --jq .headRefName");
  });
});

describe("pr-cleanup skill: step 0 hardening contracts", () => {
  test("resolution failure is detectable before dirname runs", () => {
    expect(body()).toContain(`[ -n "$COMMON_DIR" ]`);
  });

  test("validation additionally requires show-toplevel equality", () => {
    const s = sliceBetween("### Step 0", "### Step 1");
    expect(s).toContain("rev-parse --show-toplevel");
  });

  test("derives $REPO for gh anchoring instead of cwd auto-detection", () => {
    const t = body();
    expect(t).toContain("gh repo view --json nameWithOwner");
    expect(t).toContain(`--repo "$REPO"`);
  });
});

describe("pr-cleanup skill: option terminators at every branch-name sink", () => {
  test("both branch -D call sites take -- before the name", () => {
    const hits = body().match(/branch -D -- "\$\{BRANCH:\?\}"/g) ?? [];
    expect(hits.length).toBe(2);
  });

  test("the remote-branch check takes -- before the name", () => {
    expect(body()).toContain(`ls-remote --heads origin -- "$BRANCH"`);
  });

  test("the remote deletion takes -- before the name", () => {
    expect(body()).toContain(`push origin --delete -- "\${BRANCH:?}"`);
  });
});

describe("pr-cleanup skill: ${VAR:?} backstop at every destructive sink (Hard Rule 11)", () => {
  // `git -C ""` silently degrades to the current directory, and an
  // existence check run against the wrong repo green-lights the delete —
  // so every destructive expansion must abort when the variable is unset.
  test("all five git sinks anchor with ${PRIMARY_ROOT:?}", () => {
    const hits = body().match(/git -C "\$\{PRIMARY_ROOT:\?\}"/g) ?? [];
    expect(hits.length).toBe(5);
  });

  test("both worktree removals take ${WORKTREE_PATH:?} as the operand", () => {
    const hits = body().match(/worktree remove (?:--force )?"\$\{WORKTREE_PATH:\?\}"/g) ?? [];
    expect(hits.length).toBe(2);
  });

  test("both branch deletions and the remote deletion take ${BRANCH:?}", () => {
    const hits = body().match(/"\$\{BRANCH:\?\}"/g) ?? [];
    expect(hits.length).toBe(3);
  });
});

describe("pr-cleanup skill: step 0 captures the invocation context pre-anchoring", () => {
  test("step 0 captures the invoking branch and directory as runnable lines", () => {
    const s = sliceBetween("### Step 0", "### Step 1");
    expect(s).toContain(`INVOKE_BRANCH="$(git branch --show-current)"`);
    expect(s).toContain(`INVOKE_DIR="$(pwd -P)"`);
  });

  test("the capture precedes the $PRIMARY_ROOT resolution in the step 0 block", () => {
    // Order matters: once commands anchor to $PRIMARY_ROOT, branch
    // resolution names the primary clone's checkout (typically the
    // default branch), not the branch being cleaned up.
    const s = sliceBetween("### Step 0", "### Step 1");
    const capture = s.indexOf(`INVOKE_BRANCH="$(git branch --show-current)"`);
    const resolve = s.indexOf("COMMON_DIR=");
    expect(capture).toBeGreaterThanOrEqual(0);
    expect(resolve).toBeGreaterThan(capture);
  });

  test("step 0 closes the list of anchors that are not the primary clone", () => {
    // Four: the invoking-branch capture, check-ref-format (a pure
    // ref-syntax check), step 3's dirty check, step A2's inspection.
    const s = sliceBetween("### Step 0", "### Step 1");
    expect(s).toContain("Exactly four other anchors exist");
    expect(flat(s)).toMatch(/four other anchors exist:[^.]*invoking-branch capture/);
    expect(flat(s)).toMatch(/four other anchors exist:.*check-ref-format/);
  });

  test("step 2's no-argument fallback consumes the step 0 capture", () => {
    const s = sliceBetween("### Step 2", "### Step 3");
    expect(s).toContain("$INVOKE_BRANCH");
  });

  test("step 2 never resolves the fallback via the anchored clone", () => {
    const s = sliceBetween("### Step 2", "### Step 3");
    // Guard: an empty slice must fail, not vacuously pass the absence check.
    expect(s.length).toBeGreaterThan(0);
    expect(s).not.toContain(`git -C "$PRIMARY_ROOT" branch --show-current`);
  });
});

describe("pr-cleanup skill: dotfiles residue is absent", () => {
  test("carries no machine-specific MySQL provisioning residue", () => {
    const t = body();
    // Guard: an empty body must fail, not vacuously pass the absence checks.
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toContain("mysql");
    expect(t).not.toContain("-uroot");
    expect(t).not.toContain("release-owl");
  });

  test("carries no host path convention and never rebases the pull", () => {
    const t = body();
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toContain("~/Development");
    expect(t).not.toContain("pull --rebase");
  });
});

describe("pr-cleanup skill: worktree-isolation teardown hands off to it", () => {
  test("worktree-isolation references skills/pr-cleanup/SKILL.md", () => {
    const t = existsSync(WORKTREE_ISOLATION) ? read(WORKTREE_ISOLATION) : "";
    expect(t).toContain("skills/pr-cleanup/SKILL.md");
  });

  test("frontmatter retains explicit abandon cue and Mode A gate", () => {
    const description = frontmatter(body()).split("\n").find((line) => line.startsWith("description:")) ?? "";
    expect(description).toContain('"abandon this"');
    expect(description).toContain("never infer abandon intent");
  });
});
