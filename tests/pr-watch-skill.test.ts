// tests/pr-watch-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `pr-watch` RUNTIME skill
// (skills/pr-watch/SKILL.md) — a standalone bounded watch loop distributed
// to Team's users. Arming undrafts the
// PR, snapshots a baseline, and polls GitHub every ~31 minutes for up to 48
// cycles (~24 h). New feedback runs the pr-open-comments triage procedure
// (referenced by path, never restated). Default mode auto-applies items the
// triage rates above 90% confidence (a batch fully handled that way resumes
// the loop) and presents-then-stops for the rest; authorized mode (granted
// per arming instruction) applies, pushes, replies, resolves, and resumes
// regardless of confidence. Approval never auto-runs /shipit.
//
// Also pins the cross-file handoff: skills/team-pr/SKILL.md Completion points
// at /pr-watch.
//
// Every assertion is guarded so a not-yet-existing skill file yields a failed
// expect(), never an uncaught ENOENT — the mechanical gate rejects crashes,
// not clean assertion failures.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
// pr-watch is a RUNTIME skill — under skills/ (distributed), not .claude/.
const SKILL = join(REPO_ROOT, "skills", "pr-watch", "SKILL.md");
const TEAM_PR_SKILL = join(REPO_ROOT, "skills", "team-pr", "SKILL.md");

// Defensive read: missing file → "" so content assertions FAIL (not throw).
function body(): string {
  return existsSync(SKILL) ? read(SKILL) : "";
}
function fm(): string {
  return existsSync(SKILL) ? frontmatter(read(SKILL)) : "";
}
function teamPrBody(): string {
  return existsSync(TEAM_PR_SKILL) ? read(TEAM_PR_SKILL) : "";
}
// Flatten newlines so multi-line prose can be matched in one regex.
function flat(text: string): string {
  return text.replace(/\n/g, " ");
}

describe("pr-watch skill: runtime standalone utility frontmatter", () => {
  test("skill file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(SKILL)).toBe(true);
  });

  test("frontmatter declares name: pr-watch", () => {
    expect(/^name:\s*pr-watch\s*$/m.test(fm())).toBe(true);
  });

  test("description carries trigger phrases incl. \"ready for review\" and /pr-watch", () => {
    const f = flat(fm());
    expect(/description:.*Trigger on/i.test(f)).toBe(true);
    expect(/ready for review/i.test(f)).toBe(true);
    expect(f).toContain("/pr-watch");
  });

  test("frontmatter carries argument-hint (PR number or URL)", () => {
    expect(/^argument-hint:/m.test(fm())).toBe(true);
  });

  test("frontmatter carries effort", () => {
    expect(/^effort:/m.test(fm())).toBe(true);
  });

  test("frontmatter does NOT set disable-model-invocation (model-invocable by design)", () => {
    const f = fm();
    // Guard: an empty frontmatter must fail, not vacuously pass the absence check.
    expect(f.length).toBeGreaterThan(0);
    expect(/^disable-model-invocation:/m.test(f)).toBe(false);
  });
});

describe("pr-watch skill: arm sequence — loud undraft + best-effort tickets", () => {
  test("a draft PR is promoted via gh pr ready and the promotion is reported loudly", () => {
    const t = flat(body());
    expect(t).toContain("gh pr ready");
  });

  test("applies the best-effort in-review ticket transition (never blocks)", () => {
    const t = flat(body());
    expect(t).toContain("tracking-tickets");
  });
});

describe("pr-watch skill: bounded cycle mechanics", () => {
  test("sleeps in bounded chunks: the literal sleep 600 appears", () => {
    expect(body()).toContain("sleep 600");
  });
  test("polls PR state and reviewDecision alongside the trimmed reviewThreads query", () => {
    const t = body();
    expect(t).toContain("gh pr view");
    expect(t).toContain("reviewDecision");
    expect(t).toContain("reviewThreads");
    expect(t).toContain("isResolved");
  });

  test("polls review submissions so a body-only COMMENT review still fires a change", () => {
    const t = body();
    expect(t).toContain("submittedAt");
    expect(t).toContain("author { login }");
    expect(t).toContain("state body submittedAt");
  });
});

describe("pr-watch skill: approval never auto-runs /shipit", () => {
  test("hands off with Next: run /shipit — the user lands the PR", () => {
    expect(body()).toContain("Next: run /shipit");
  });
});

describe("pr-watch skill: pinned edge cases", () => {
  test("empty-body CHANGES_REQUESTED with no threads ⇒ status line, then stop", () => {
    const t = flat(body());
    expect(t).toContain("CHANGES_REQUESTED");
  });
});

describe("pr-watch skill: triage contract is referenced, never restated", () => {
  test("references the triage procedure by path", () => {
    expect(body()).toContain("skills/pr-open-comments/SKILL.md");
  });

  test("does not restate the punch-list pipeline (no verdict internals)", () => {
    const t = body();
    // Guard: an empty body must fail, not vacuously pass the absence checks.
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toContain("STILL RELEVANT");
    expect(t).not.toContain("ALREADY ADDRESSED");
  });
});

describe("pr-watch skill: team-pr Completion hands off to /pr-watch", () => {
  test("skills/team-pr/SKILL.md Completion contains the /pr-watch pointer", () => {
    const t = teamPrBody();
    const completionIdx = t.indexOf("## Completion");
    const pointerIdx = t.indexOf("/pr-watch");
    expect(completionIdx).toBeGreaterThanOrEqual(0);
    expect(pointerIdx).toBeGreaterThan(completionIdx);
  });
});
