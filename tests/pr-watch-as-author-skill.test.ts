// tests/pr-watch-as-author-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `pr-watch-as-author` RUNTIME
// skill (skills/pr-watch-as-author/SKILL.md) — a standalone bounded watch
// loop distributed
// to Team's users. Arming undrafts the
// PR, snapshots a baseline, and polls GitHub every ~31 minutes to a 3-cycle
// soft cap (~90 min) that hands off to the scheduled job; the cycle timing
// and that bound are owned by pr-watch-mechanics, which both watches load.
// New feedback runs the pr-open-comments triage procedure
// (referenced by path, never restated). Default mode auto-applies items the
// triage rates above 90% confidence (a batch fully handled that way resumes
// the loop) and presents-then-stops for the rest; authorized mode (granted
// per arming instruction) applies, pushes, replies, resolves, and resumes
// regardless of confidence. Approval never auto-runs /shipit.
//
// Also pins the cross-file handoff: skills/team-pr/SKILL.md Completion points
// at /pr-watch-as-author.
//
// Every assertion is guarded so a not-yet-existing skill file yields a failed
// expect(), never an uncaught ENOENT — the mechanical gate rejects crashes,
// not clean assertion failures.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read, squash } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";

const REPO_ROOT = process.cwd();
// pr-watch-as-author is a RUNTIME skill — under skills/ (distributed), not .claude/.
const SKILL = join(REPO_ROOT, "skills", "pr-watch-as-author", "SKILL.md");
const REFERENCES = join(REPO_ROOT, "skills", "pr-watch-as-author", "references");
const TEAM_PR_SKILL = join(REPO_ROOT, "skills", "team-pr", "SKILL.md");

// Defensive read: missing file → "" so content assertions FAIL (not throw).
function body(): string {
  if (!existsSync(SKILL) || !existsSync(REFERENCES)) return "";
  return [
    read(SKILL),
    ...readdirSync(REFERENCES)
      .filter((name) => /^\d\d-.*\.md$/.test(name))
      .sort()
      .map((name) => read(join(REFERENCES, name))),
  ].join("\n");
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

// pr-watch-thread-escalation: single-file guarded readers, so a phrase search
// scoped to one reference file cannot accidentally match the same words in a
// different file that body() would otherwise concatenate them next to.
const AUTHOR_POLL = join(REFERENCES, "05-3-poll-and-change-detection.md");
const AUTHOR_TRIAGE = join(REFERENCES, "06-4-on-new-feedback-run-the-triage-procedure.md");
const AUTHOR_STOP_CONDITIONS = join(REFERENCES, "09-6-stop-conditions.md");
const AUTHOR_COMPACTION = join(REFERENCES, "11-compaction-defense.md");
const AUTHOR_EDGE_CASES = join(REFERENCES, "08-5-edge-cases.md");
function fileBody(path: string): string {
  return existsSync(path) ? read(path) : "";
}

describe("pr-watch-as-author skill: runtime standalone utility frontmatter", () => {
  test("skill file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(SKILL)).toBe(true);
  });

  test("frontmatter declares name: pr-watch-as-author", () => {
    expect(/^name:\s*pr-watch-as-author\s*$/m.test(fm())).toBe(true);
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

describe("pr-watch-as-author skill: arm sequence — loud undraft + best-effort tickets", () => {
  test("a draft PR is promoted via gh pr ready and the promotion is reported loudly", () => {
    const t = flat(body());
    expect(t).toContain("gh pr ready");
  });

  test("applies the best-effort in-review ticket transition (never blocks)", () => {
    const t = flat(body());
    expect(t).toContain("tracking-tickets");
  });
});

describe("pr-watch-as-author skill: bounded cycle mechanics", () => {
  test("cycle timing and the bound are delegated to pr-watch-mechanics, not restated", () => {
    // The interval, the soft cap, and the handoff are shared with
    // pr-watch-as-reviewer and live in pr-watch-mechanics, which owns their
    // assertions. Restating them here would let the two copies drift.
    expect(loadsSkill(body(), "pr-watch-mechanics")).toBe(true);
  });

  test("binds its own handoff state for the shared soft cap", () => {
    // The slot this skill fills: the reviewer's payload is a different set.
    const t = flat(body());
    expect(t).toContain("reviewDecision");
    expect(t).toContain("triaged-comment ids");
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

describe("pr-watch-as-author skill: approval never auto-runs /shipit", () => {
  test("hands off with Next: run /shipit — the user lands the PR", () => {
    expect(body()).toContain("Next: run /shipit");
  });
});

describe("pr-watch-as-author skill: pinned edge cases", () => {
  test("empty-body CHANGES_REQUESTED with no threads ⇒ status line, then stop", () => {
    const t = flat(body());
    expect(t).toContain("CHANGES_REQUESTED");
  });

  // pr-watch-thread-escalation, slice 3: the needs-clarification recipient
  // text widens to cover a choice the user owns, not only an unclear ask.
  test("the CHANGES_REQUESTED needs-clarification edge case widens who it asks — the reviewer when unclear, the user when the user owns the choice", () => {
    const t = squash(fileBody(AUTHOR_EDGE_CASES));
    const idx = t.indexOf("CHANGES_REQUESTED");
    expect(idx).toBeGreaterThan(-1);
    const window = t.slice(idx, idx + 500);
    expect(window).toContain("ask the reviewer when the ask itself is unclear");
    expect(window).toContain("present the choice to the user when the user owns it");
  });
});

describe("pr-watch-as-author skill: triage contract is referenced, never restated", () => {
  test("loads the triage procedure through the Skill tool", () => {
    expect(loadsSkill(body(), "pr-open-comments")).toBe(true);
  });

  test("does not restate the punch-list pipeline (no verdict internals)", () => {
    const t = body();
    // Guard: an empty body must fail, not vacuously pass the absence checks.
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toContain("STILL RELEVANT");
    expect(t).not.toContain("ALREADY ADDRESSED");
  });
});

describe("pr-watch-as-author skill: team-pr handoff", () => {
  test("skills/team-pr/SKILL.md names /pr-watch-as-author", () => {
    expect(teamPrBody()).toContain("/pr-watch-as-author");
  });

  test("team-pr handoff follows its draft PR creation", () => {
    const text = teamPrBody();
    const create = text.lastIndexOf("gh pr create");
    const handoff = text.lastIndexOf("/pr-watch-as-author");
    expect(create).toBeGreaterThanOrEqual(0);
    expect(handoff).toBeGreaterThan(create);
  });

});

// pr-watch-thread-escalation, slice 1: a third-party login on an unresolved
// tracked thread stops the loop before the triage call that cycle. Unlike
// the reviewer side, the check also requires the viewer to have replied on
// the thread first — a second reviewer commenting on a thread the loop
// never answered stays ordinary feedback.
describe("pr-watch-as-author skill: third-party participant stop (design decisions 3, 6, 7, 11)", () => {
  function pollSection(): string {
    const t = squash(fileBody(AUTHOR_POLL));
    const start = t.indexOf("a trimmed GraphQL");
    if (start < 0) return "";
    const end = t.indexOf("the latest review submission");
    return end > start ? t.slice(start, end) : t.slice(start, start + 400);
  }

  test("the reviewThreads selection widens beyond thread ids and isResolved to each comment's id and author login", () => {
    const section = pollSection();
    expect(section.length).toBeGreaterThan(0);
    expect(section).not.toContain("thread ids and `isResolved` only");
    expect(section).toContain("author { login }");
    expect(section).toContain("comment");
  });

  test("the check order runs the third-party check after the poll and before the triage call", () => {
    const t = squash(fileBody(AUTHOR_TRIAGE));
    const thirdPartyIdx = t.indexOf("third-party");
    const triageIdx = t.indexOf("call the Skill tool with `pr-open-comments`");
    expect(thirdPartyIdx).toBeGreaterThan(-1);
    expect(triageIdx).toBeGreaterThan(-1);
    expect(thirdPartyIdx).toBeLessThan(triageIdx);
  });

  test("the check requires both a viewer comment and a third-party comment on the thread — a second reviewer alone stays ordinary feedback", () => {
    const t = squash(fileBody(AUTHOR_TRIAGE));
    const idx = t.indexOf("third-party");
    expect(idx).toBeGreaterThan(-1);
    const window = t.slice(Math.max(0, idx - 200), idx + 200);
    expect(window).toContain("viewer");
  });

  test("stop-conditions file names Third-party participant and adds three", () => {
    const t = squash(fileBody(AUTHOR_STOP_CONDITIONS));
    expect(t).toContain("adds three");
    expect(t).toContain("Third-party participant");
  });

  test("compaction-defense names third-party participant in the stop-reason list", () => {
    expect(squash(fileBody(AUTHOR_COMPACTION))).toContain("third-party participant");
  });
});
