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
// The value of the argument-hint frontmatter line, or "" when absent.
function argumentHint(): string {
  return /^argument-hint:.*$/m.exec(fm())?.[0] ?? "";
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
    // intent + CI-green gating, not a hard flag — so the model can reach it
    // when the user asks it to land the PR.
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

  test("the CI watch runs backgrounded so the 1800s cap is the one that applies", () => {
    // In the foreground the harness kills the watch at its own ceiling (600s
    // in Claude Code) with exit 143, so `timeout 1800` never binds and the
    // watch is lost rather than timed out on any repo with CI over 10 minutes.
    const t = body();
    expect(t).toContain("run_in_background: true");
    expect(t).toContain("principle-non-blocking-waits");
  });

  // `gh pr checks --watch` exits when nothing is pending RIGHT NOW, and two
  // states produce that: every check finished, and no check has started yet.
  // The exit code cannot tell them apart, so treating exit 0 as "CI green"
  // squash-merges a branch whose workflows had not registered yet. The verdict
  // must come from GitHub's aggregate, which knows a check suite is still
  // running even when every job it has created so far has passed.
  test("the merge verdict is mergeStateStatus, read after the watch", () => {
    const t = body();
    const watch = t.indexOf("timeout 1800 gh pr checks");
    const verify = t.indexOf("**3c");
    const merge = t.indexOf("gh pr merge <pr-number>");
    // Guards: all three anchors must exist, or the ordering below is
    // meaningless and would pass for the wrong reason.
    expect(watch).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(-1);
    expect(merge).toBeGreaterThan(-1);
    // The verify part sits after the watch exits and before anything merges.
    expect(verify).toBeGreaterThan(watch);
    expect(merge).toBeGreaterThan(verify);
    // And it is the aggregate that gets read there, not the exit code again.
    expect(t.slice(verify, merge)).toContain("mergeStateStatus");
  });

  test("the watch is settled against a registered check set before it starts", () => {
    // Without a settle the watch races the workflows attaching to the head
    // commit, which is the common case immediately after a push.
    const t = body();
    const settle = t.indexOf("statusCheckRollup");
    const watch = t.indexOf("timeout 1800 gh pr checks");
    expect(settle).toBeGreaterThan(-1);
    expect(watch).toBeGreaterThan(-1);
    expect(settle).toBeLessThan(watch);
  });

  test("the merge-state vocabulary is enumerated, and only CLEAN-ish merges", () => {
    // A status the skill does not name must stop the land rather than fall
    // through to a merge, so the states it acts on are spelled out.
    const t = body();
    for (const state of ["CLEAN", "UNSTABLE", "BEHIND", "UNKNOWN"]) {
      expect(t).toContain(state);
    }
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

// The invocation IS the authorization: `/shipit` fires only on explicit ship
// intent, so a second ask before `gh pr merge` re-requests permission the user
// already granted. Because this is the RUNTIME skill, every caller that chains
// into it inherits that stop. Two guards remain and both are mechanical:
// explicit ship intent scopes the invocation, and the CI-green wait halts the
// land before `gh pr merge` runs.
describe("shipit skill: the merge is not gated on a human confirmation", () => {
  test("argument-hint offers no --yes (there is no prompt left to skip)", () => {
    // Guard: a missing argument-hint must fail, not vacuously pass the absence
    // check below. The flag existed only to bypass the confirmation.
    const hint = argumentHint();
    expect(hint.length).toBeGreaterThan(0);
    expect(hint).toContain("pr-number");
    expect(hint).not.toContain("--yes");
  });

  test("no --yes escape hatch anywhere in the skill", () => {
    const t = body();
    // Guard: a missing file reads as "" and would vacuously pass.
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toContain("--yes");
  });

  // A structural check, not a wording pin: it counts numbered step headings
  // between the CI gate and the merge command, so it fires on ANY step
  // re-inserted there regardless of what that step is titled. Exactly one
  // heading may appear — the merge step's own — because the CI-wait step's
  // body continues past its fenced command.
  test("no numbered step sits between the CI-green gate and the merge", () => {
    const t = body();
    const ciGate = t.indexOf("timeout 1800 gh pr checks");
    const merge = t.indexOf("gh pr merge <pr-number>");
    // Guards: both anchors must exist, in this order, or the slice below is
    // meaningless and the heading count would pass for the wrong reason.
    expect(ciGate).toBeGreaterThan(-1);
    expect(merge).toBeGreaterThan(ciGate);
    const between = t.slice(ciGate, merge);
    const steps = [...between.matchAll(/^###\s+\d+\./gm)];
    expect(steps.length).toBe(1);
  });
});

describe("shipit skill: post-merge cleanup", () => {
  test("names the /pr-cleanup command", () => {
    expect(body()).toContain("/pr-cleanup");
  });

  test("names both cleanup modes", () => {
    const text = body();
    expect(text).toContain("Mode A");
    expect(text).toContain("Mode B");
  });

  // NOT asserted here: that cleanup is *conditioned* on the merge succeeding.
  // That is prose semantics, and the only L2 shape available for it is a
  // proximity span between "/pr-cleanup" and "merged" — which docs/testing.md
  // bans outright ("Proximity spans test if an author put two ideas in one
  // sentence. That is a style question, not a contract"). It also failed to
  // discriminate: the span matched the buggy text too, so it would have
  // passed while the bug shipped. Conditional-on-success belongs at L5/L6,
  // where a model can judge whether the instruction lands.

});
