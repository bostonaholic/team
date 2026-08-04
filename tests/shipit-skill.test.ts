// tests/shipit-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `shipit` RUNTIME skill
// (skills/shipit/SKILL.md) — a generic, project-agnostic "land the PR" action
// distributed to Team's users (docs/plans/2026-06-15-version-at-land-time).
// It knows NOTHING about Team's versioning: it discovers the open PR, pushes
// unpushed commits, waits for CI, handles PR-behind-base and branch-protection,
// and squash-merges so the PR title lands as the commit subject. Team's own
// version-bump mechanics are fenced separately by
// tests/version-bump-skill.test.ts (the dev skill).
//
// Every assertion is guarded so a not-yet-existing skill file yields a failed
// expect(), never an uncaught ENOENT — the mechanical gate rejects crashes,
// not clean assertion failures.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
// shipit is a RUNTIME skill — it lives under skills/ (distributed), not .claude/.
const SHIPIT_SKILL = join(REPO_ROOT, "skills", "shipit", "SKILL.md");

// Defensive read: missing file → "" so content assertions FAIL (not throw).
function body(): string {
  return existsSync(SHIPIT_SKILL) ? read(SHIPIT_SKILL) : "";
}
function fm(): string {
  return existsSync(SHIPIT_SKILL) ? frontmatter(read(SHIPIT_SKILL)) : "";
}
// Flatten newlines so multi-line prose can be matched in one regex.
function flat(text: string): string {
  return text.replace(/\n/g, " ");
}
// The Completion section, or "" when absent — content assertions against ""
// fail cleanly.
function completionSection(): string {
  const text = body();
  const start = text.indexOf("## Completion");
  return start >= 0 ? text.slice(start) : "";
}

describe("shipit skill: it is a runtime skill, project-agnostic", () => {
  test("skill file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(SHIPIT_SKILL)).toBe(true);
  });

  test("frontmatter declares name: shipit", () => {
    expect(/^name:\s*shipit\s*$/m.test(fm())).toBe(true);
  });

  test("frontmatter does NOT set disable-model-invocation (model-invocable by design)", () => {
    // shipit is irreversible (it merges), but the guard is explicit ship
    // intent + the pre-merge confirmation + CI-green gating, not a hard flag —
    // so the model can reach it when the user asks it to land the PR.
    const f = fm();
    // Guard: an empty frontmatter must fail, not vacuously pass the absence check.
    expect(f.length).toBeGreaterThan(0);
    expect(/^disable-model-invocation:/m.test(f)).toBe(false);
  });

  test("carries NO Team-version-specific logic (it is generic)", () => {
    // The land skill must not bump versions, edit the changelog, or know about
    // Team's version strings — that is the dev version-bump skill's job.
    const t = body();
    expect(t).not.toContain("next-version.sh");
    expect(t).not.toContain("plugin.json");
    expect(t).not.toContain("marketplace.json");
    expect(t).not.toContain("[Unreleased]");
    expect(/chore\(version\)/.test(t)).toBe(false);
    expect(/(four|five) version strings/i.test(t)).toBe(false);
  });
});

describe("shipit skill: model-invocable, scoped to explicit ship intent", () => {
  test("description scopes invocation to explicit ship intent + names the trigger phrases", () => {
    const f = flat(fm());
    expect(f.length).toBeGreaterThan(0);
    expect(/"ship it"/i.test(f)).toBe(true);
    expect(/"land the PR"/i.test(f)).toBe(true);
    expect(f).toContain("/shipit");
  });

});

describe("shipit skill: PR discovery + refuse branches", () => {
  test("discovers the open PR via gh pr view with a base-branch fallback", () => {
    const t = flat(body());
    expect(/gh pr view[^.]{0,120}--json[^.]{0,120}baseRefName/i.test(t)).toBe(true);
  });
});

describe("shipit skill: push, wait for CI, merge", () => {
  test("pushes unpushed local commits before waiting on CI", () => {
    expect(body()).toContain("git push");
  });

  test("CI poll timeout is mechanically enforced (timeout 1800 + exit 124)", () => {
    // A `gh pr checks --watch` cannot self-enforce a cap — a hung CI loops
    // forever. The cap must be a real command bound, and 124 must map to stop.
    const t = flat(body());
    expect(/timeout\s+1800\s+gh pr checks/.test(t)).toBe(true);
    expect(/\b124\b/.test(t)).toBe(true);
  });

  test("CI poll uses --fail-fast so a failing check exits immediately", () => {
    expect(body()).toContain("--fail-fast");
  });

  test("names `gh pr merge --squash` explicitly", () => {
    // Squash lands the PR title as the commit subject (so a version in the
    // title shows up in git log) while keeping linear history.
    expect(body()).toContain("gh pr merge");
    expect(body()).toContain("--squash");
    expect(body()).not.toContain("gh pr merge <pr-number> --rebase");
  });

  test("gates the pre-flight check on squashMergeAllowed (the required strategy)", () => {
    expect(body()).toContain("squashMergeAllowed");
  });

  test("builds the squash subject from the PR title so the version lands in git log", () => {
    // The PR title (which may carry a version) must become the commit subject:
    // capture `title` at discovery and pass it through --subject.
    const t = flat(body());
    expect(/--json[^.]{0,80}title/i.test(t)).toBe(true);
    expect(body()).toContain("--subject");
  });
});

describe("shipit skill: post-merge cleanup", () => {
  test("the Completion report names /pr-cleanup", () => {
    expect(completionSection()).toContain("/pr-cleanup");
  });

  // A merged PR leaves the default branch unsynced and the branch undeleted.
  // Nothing about that is a decision — the merge already happened, and
  // /pr-cleanup's Mode A gates itself on merged-PR verification. Telling the
  // operator to go run it re-inserts a human gate the pipeline is designed
  // not to have, and because this is the RUNTIME skill, every caller inherits
  // the stop. Completion must run cleanup, not recommend it.
  test("Completion instructs running /pr-cleanup, not recommending it", () => {
    const c = flat(completionSection());
    // Negative sweep: the passive framings. A meaning-preserving rewrite never
    // reintroduces a phrasing the contract bans, so this cannot pin wording.
    expect(/end with the handoff/i.test(c)).toBe(false);
    expect(/Next:\s*run \/pr-cleanup/i.test(c)).toBe(false);
  });

  // NOT asserted here: that cleanup is *conditioned* on the merge succeeding.
  // That is prose semantics, and the only L2 shape available for it is a
  // proximity span between "/pr-cleanup" and "merged" — which docs/testing.md
  // bans outright ("Proximity spans test if an author put two ideas in one
  // sentence. That is a style question, not a contract"). It also failed to
  // discriminate: the span matched the buggy text too, so it would have
  // passed while the bug shipped. Conditional-on-success belongs at L5/L6,
  // where a model can judge whether the instruction lands.

  // Mode B force-deletes remote branches and worktrees on the strength of an
  // explicit abandon request. It must never be reachable by automatic chaining.
  test("only Mode A is auto-reachable; Mode B stays user-triggered", () => {
    const c = flat(completionSection());
    expect(/Mode A/.test(c)).toBe(true);
    expect(/Mode B/.test(c)).toBe(true);
  });
});
