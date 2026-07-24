// tests/pr-watch-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `pr-watch` RUNTIME skill
// (skills/pr-watch/SKILL.md) — a standalone bounded watch loop distributed
// to Team's users (docs/plans/2026-07-24-pr-watch-loop). Arming undrafts the
// PR, snapshots a baseline, and polls GitHub every ~31 minutes for up to 48
// cycles (~24 h). New feedback runs the pr-open-comments triage procedure
// (referenced by path, never restated). Default mode presents the punch list
// and stops the turn; authorized mode (granted per arming instruction)
// applies, pushes, 🤖-replies, resolves, and resumes. Approval never
// auto-runs /shipit.
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

describe("pr-watch skill: refusal preconditions", () => {
  test("no PR resolves from branch or argument ⇒ fail fast with a clear message", () => {
    const t = flat(body());
    expect(
      /(fail[s]? fast|clear message)[^.]{0,160}(no PR|PR)|no PR[^.]{0,160}(fail[s]? fast|stop|clear message)/i.test(
        t,
      ),
    ).toBe(true);
  });

  test("MERGED or CLOSED PR ⇒ refuse to arm before doing any work", () => {
    const t = flat(body());
    expect(
      /(merged|closed)[^.]{0,160}(refuse|never arm|do not arm)|(refuse|do not arm)[^.]{0,160}(merged|closed)/i.test(
        t,
      ),
    ).toBe(true);
  });
});

describe("pr-watch skill: arm sequence — loud undraft + best-effort tickets", () => {
  test("a draft PR is promoted via gh pr ready and the promotion is reported loudly", () => {
    const t = flat(body());
    expect(t).toContain("gh pr ready");
    expect(/loud|report[^.]{0,120}promot|promot[^.]{0,120}report/i.test(t)).toBe(true);
  });

  test("gh pr ready failure ⇒ warn and keep watching (never abort the watch)", () => {
    const t = flat(body());
    expect(/warn[^.]{0,160}(keep|continue)[^.]{0,60}watch/i.test(t)).toBe(true);
  });

  test("applies the best-effort in-review ticket transition (never blocks)", () => {
    const t = flat(body());
    expect(t).toContain("tracking-tickets");
    expect(/best[- ]effort/i.test(t)).toBe(true);
  });

  test("takes a baseline snapshot at arm time", () => {
    expect(/baseline/i.test(flat(body()))).toBe(true);
  });
});

describe("pr-watch skill: bounded cycle mechanics", () => {
  test("sleeps in bounded chunks: the literal sleep 600 appears", () => {
    expect(body()).toContain("sleep 600");
  });

  test("hard cap of 48 cycles (~24 h)", () => {
    const t = flat(body());
    expect(/(cap|maximum|max|48)[^.]{0,80}cycle|cycle[^.]{0,80}48/i.test(t)).toBe(true);
    expect(/\b48\b/.test(t)).toBe(true);
  });

  test("cycle 0 polls immediately (no initial sleep)", () => {
    const t = flat(body());
    expect(/cycle 0[^.]{0,120}immediate/i.test(t)).toBe(true);
  });

  test("each poll prints a one-line snapshot", () => {
    const t = flat(body());
    expect(/one[- ]line[^.]{0,120}(snapshot|poll|output)|(snapshot|poll)[^.]{0,60}one[- ]line/i.test(t)).toBe(true);
  });

  test("polls PR state and reviewDecision alongside the trimmed reviewThreads query", () => {
    const t = body();
    expect(t).toContain("gh pr view");
    expect(t).toContain("reviewDecision");
    expect(t).toContain("reviewThreads");
    expect(t).toContain("isResolved");
  });
});

describe("pr-watch skill: stop conditions", () => {
  test("stops on approval, merge, close, and user interrupt", () => {
    const t = flat(body());
    expect(/approv/i.test(t)).toBe(true);
    expect(/merge/i.test(t)).toBe(true);
    expect(/close/i.test(t)).toBe(true);
    expect(/interrupt/i.test(t)).toBe(true);
  });

  test("cycle-48 timeout ⇒ report and offer to re-arm", () => {
    const t = flat(body());
    expect(/timeout[^.]{0,160}re-?arm|re-?arm[^.]{0,160}timeout/i.test(t)).toBe(true);
  });

  test("3 consecutive poll failures ⇒ stop and name the error", () => {
    const t = flat(body());
    expect(/(3|three) consecutive[^.]{0,80}fail/i.test(t)).toBe(true);
    expect(/nam(e|es|ing)[^.]{0,60}error|error[^.]{0,60}nam(e|es|ing)|report[^.]{0,60}error/i.test(t)).toBe(true);
  });
});

describe("pr-watch skill: approval never auto-runs /shipit", () => {
  test("on approval, runs one final triage pass over still-unresolved threads", () => {
    const t = flat(body());
    expect(/final triage/i.test(t)).toBe(true);
  });

  test("hands off with Next: run /shipit — the user lands the PR", () => {
    expect(body()).toContain("Next: run /shipit");
  });

  test("pins the prohibition: never auto-run /shipit", () => {
    const t = flat(body());
    expect(/(never|not)[^.]{0,80}auto[- ]?run[^.]{0,40}\/shipit/i.test(t)).toBe(true);
  });
});

describe("pr-watch skill: pinned edge cases", () => {
  test("zero unresolved threads at a wake ⇒ re-arm silently, present nothing", () => {
    const t = flat(body());
    expect(
      /(zero|no)[^.]{0,80}unresolved[^.]{0,200}(silent|re-?arm)|re-?arm silently/i.test(t),
    ).toBe(true);
  });

  test("PR already approved at arm ⇒ report + final triage, no loop", () => {
    const t = flat(body());
    expect(/already approved[^.]{0,240}(no loop|final triage|without[^.]{0,40}loop)/i.test(t)).toBe(true);
  });

  test("empty-body CHANGES_REQUESTED with no threads ⇒ status line, then stop", () => {
    const t = flat(body());
    expect(t).toContain("CHANGES_REQUESTED");
    expect(/status line/i.test(t)).toBe(true);
    expect(/status line[^.]{0,240}stop|stop[^.]{0,240}status line/i.test(t)).toBe(true);
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

// ---------------------------------------------------------------------------
// Slice 3 — authorized fix-and-resume mode
// ---------------------------------------------------------------------------

describe("pr-watch skill: authorized mode — apply, resolve, resume", () => {
  test("mode is granted per arming instruction (e.g. \"watch this PR and fix comments\")", () => {
    const t = flat(body());
    expect(/arm(ing)?[^.]{0,160}(instruction|authoriz)|authoriz[^.]{0,160}arm/i.test(t)).toBe(true);
  });

  test("an authorized batch runs apply → push → 🤖 reply → resolve, then resumes watching", () => {
    const t = flat(body());
    expect(/appl(y|ies|ied)[^.]{0,120}push[^.]{0,120}repl(y|ies)[^.]{0,120}resolve/i.test(t)).toBe(true);
    expect(t).toContain("🤖");
    expect(/(resume|re-?arm)[^.]{0,160}(watch|loop|until)/i.test(t)).toBe(true);
  });

  test("carve-out batch ⇒ apply authorized items first, present carve-outs, stop the loop", () => {
    const t = flat(body());
    expect(/carve-?out/i.test(t)).toBe(true);
    expect(/authorized items first|appl(y|ies)[^.]{0,80}first/i.test(t)).toBe(true);
    expect(
      /(never|do not|don't)[^.]{0,100}(watch|loop)[^.]{0,80}past[^.]{0,80}disagreement/i.test(t),
    ).toBe(true);
  });

  test("push failure in authorized mode ⇒ stop and report", () => {
    const t = flat(body());
    expect(/push fail(ure|s|ed)?[^.]{0,200}(stop|report)/i.test(t)).toBe(true);
  });

  test("never reply \"done\" or resolve a thread without landed code", () => {
    const t = flat(body());
    expect(
      /(never|don'?t)[^.]{0,80}repl(y|ies)[^.]{0,30}["“']?done["”']?|without landed code/i.test(t),
    ).toBe(true);
  });

  test("every loop report names the active mode", () => {
    const t = flat(body());
    expect(
      /(every|each)[^.]{0,120}(report|snapshot)[^.]{0,120}mode|mode[^.]{0,120}(every|each)[^.]{0,80}(report|snapshot)/i.test(
        t,
      ),
    ).toBe(true);
  });

  test("a timeout re-arm keeps the mode", () => {
    const t = flat(body());
    expect(
      /re-?arm[^.]{0,160}(keep|retain|preserve)[^.]{0,60}mode|(keep|retain|preserve)s?[^.]{0,60}mode[^.]{0,160}re-?arm/i.test(
        t,
      ),
    ).toBe(true);
  });
});
