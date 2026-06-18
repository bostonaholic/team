// tests/shipit-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `shipit` RUNTIME skill
// (skills/shipit/SKILL.md) — a generic, project-agnostic "land the PR" action
// distributed to Team's users (docs/plans/2026-06-15-version-at-land-time).
// It knows NOTHING about Team's versioning: it discovers the open PR, pushes
// unpushed commits, waits for CI, handles PR-behind-base and branch-protection,
// and rebase-merges. Team's own version-bump mechanics are fenced separately by
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

describe("shipit skill: it is a runtime skill, project-agnostic", () => {
  test("skill file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(SHIPIT_SKILL)).toBe(true);
  });

  test("frontmatter declares name: shipit", () => {
    expect(/^name:\s*shipit\s*$/m.test(fm())).toBe(true);
  });

  test("frontmatter carries disable-model-invocation: true (never auto-merge)", () => {
    // shipit is irreversible (it merges) → user-invocable only, so the model
    // can never auto-trigger a merge.
    expect(/^disable-model-invocation:\s*true\s*$/m.test(fm())).toBe(true);
  });

  test("carries NO Team-version-specific logic (it is generic)", () => {
    // The land skill must not bump versions, edit the changelog, or know about
    // Team's four version strings — that is the dev version-bump skill's job.
    const t = body();
    expect(t).not.toContain("next-version.sh");
    expect(t).not.toContain("plugin.json");
    expect(t).not.toContain("marketplace.json");
    expect(t).not.toContain("[Unreleased]");
    expect(/chore\(version\)/.test(t)).toBe(false);
    expect(/four version strings/i.test(t)).toBe(false);
  });
});

describe("shipit skill: PR discovery + refuse branches", () => {
  test("discovers the open PR via gh pr view with a base-branch fallback", () => {
    const t = flat(body());
    const discovery = /gh pr view[^.]{0,120}--json[^.]{0,120}baseRefName/i.test(t);
    const fallback = /symbolic-ref[^.]{0,120}origin\/HEAD|base-branch fallback|fallback/i.test(t);
    expect(discovery).toBe(true);
    expect(fallback).toBe(true);
  });

  test("refuses if no open PR for the current branch", () => {
    const t = flat(body());
    expect(
      /(refuse|stop|abort)[^.]{0,120}no[^.]{0,40}open[^.]{0,40}PR|no[^.]{0,40}open[^.]{0,40}PR[^.]{0,120}(refuse|stop|abort|exit)/i.test(
        t,
      ),
    ).toBe(true);
  });

  test("refuses an already-merged / closed PR up front", () => {
    const t = flat(body());
    expect(
      /(already[^.]{0,20})?(merged|closed)[^.]{0,160}(refuse|stop|abort|exit|up front|up-front)|(refuse|stop|abort)[^.]{0,160}(already[^.]{0,20})?(merged|closed)/i.test(
        t,
      ),
    ).toBe(true);
  });
});

describe("shipit skill: push, wait for CI, merge", () => {
  test("pushes unpushed local commits before waiting on CI", () => {
    const t = flat(body());
    expect(/push[^.]{0,80}(unpushed|local )?commit|commit[^.]{0,40}push/i.test(t)).toBe(true);
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

  test("bounds the CI poll with both an interval and a total timeout", () => {
    const t = flat(body());
    const hasInterval = /(every|interval|each)[^.]{0,40}\d+\s*(s\b|sec|second|m\b|min|minute)/i.test(t);
    const hasTimeout = /(total|cap|timeout|maximum|max|after)[^.]{0,40}\d+\s*(s\b|sec|second|m\b|min|minute|hour)/i.test(t);
    expect(hasInterval).toBe(true);
    expect(hasTimeout).toBe(true);
  });

  test("CI fails ⇒ stop before merge, report the failing check by name", () => {
    const t = flat(body());
    const stopBeforeMerge =
      /(stop|do not|don't|halt)[^.]{0,120}(merge|merging)|(before|without)[^.]{0,40}merg/i.test(t);
    const reportFailing = /(report|surface|show|print)[^.]{0,80}fail(ing|ed)?[^.]{0,40}check|fail(ing|ed)?[^.]{0,40}check/i.test(t);
    expect(stopBeforeMerge).toBe(true);
    expect(reportFailing).toBe(true);
  });

  test("names `gh pr merge --squash` explicitly", () => {
    // Squash lands the PR title as the commit subject (so a version in the
    // title shows up in git log) while keeping linear history.
    expect(body()).toContain("gh pr merge");
    expect(body()).toContain("--squash");
    expect(body()).not.toContain("gh pr merge <pr-number> --rebase");
  });

  test("gates the pre-flight check on squashMergeAllowed (the required strategy)", () => {
    const t = flat(body());
    expect(/squashMergeAllowed[^.]{0,80}(false|enabled)|(stop|report)[^.]{0,120}squashMergeAllowed/i.test(t)).toBe(true);
  });

  test("builds the squash subject from the PR title so the version lands in git log", () => {
    // The PR title (which may carry a version) must become the commit subject:
    // capture `title` at discovery and pass it via --subject.
    const t = flat(body());
    expect(/--json[^.]{0,80}title/i.test(t)).toBe(true);
    expect(body()).toContain("--subject");
  });
});

describe("shipit skill: confirmation, concurrency, branch protection", () => {
  test("pre-merge confirmation guards the irreversible merge, skippable via --yes", () => {
    const t = flat(body());
    const confirm = /(pre-merge confirmation|confirm[^.]{0,80}(before|prior to)[^.]{0,40}merg|about to merge[^.]{0,60}proceed)/i.test(t);
    const skippable = /(non-interactive|automation)[^.]{0,120}(--yes|skip|pre-confirmed|flag)/i.test(t) || t.includes("--yes");
    expect(confirm).toBe(true);
    expect(skippable).toBe(true);
  });

  test("PR behind base ⇒ rebase and force-with-lease (never bare --force)", () => {
    const t = flat(body());
    const behindRebase =
      /(behind|advanced|not[^.]{0,20}up to date|out of date)[^.]{0,160}rebase|rebase[^.]{0,160}(behind|advanced|base advanced)/i.test(t);
    expect(behindRebase).toBe(true);
    expect(body()).toContain("--force-with-lease");
    const neverBareForce = /never[^.]{0,40}bare[^.]{0,20}`?--force`?/i.test(t);
    expect(neverBareForce).toBe(true);
  });

  test("branch-protection rejection ⇒ surface verbatim, never force", () => {
    const t = flat(body());
    const surface = /(surface|report|show|print)[^.]{0,80}(verbatim|rejection|message|GitHub'?s)/i.test(t);
    const neverForce = /(never|do not|don't)[^.]{0,60}force/i.test(t);
    expect(surface).toBe(true);
    expect(neverForce).toBe(true);
  });
});
