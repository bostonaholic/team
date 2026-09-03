// tests/guarded-skill-prose.test.ts
//
// L2 tripwire (free, deterministic): the three guarded-skill prose surfaces
// that no test pinned, so they stayed green while wrong.
//
// A skill setting `disable-model-invocation: true` is a skill whose blast
// radius is large enough that only a deliberate human invocation may start it.
// Five surfaces owe that set a mention, and two of them are already pinned by
// set equality (tests/pr-watch-as-reviewer-skill.test.ts reads the
// README.md and docs/index.md removal lists). The other three carry the same
// claim in prose and comments and were pinned by nothing:
//
//   script/dev-install-antigravity  — the comment naming which skills this
//                                     host keeps out of the model's reach
//   script/dev-install-codex        — the post-install notice naming which
//                                     skills stay model-invocable on Codex
//   docs/cross-host-portability.md  — the Antigravity probe result
//
// A skill added to the guarded set without touching those three ships a
// silently weakened safety claim: an Antigravity user reads a comment that
// omits the new skill, and a Codex user is never told to delete it.
//
// This asserts a CONTRACT — the presence of a skill NAME, matched as a whole
// token — never a wording. A rewrite of any of the three surfaces that keeps
// every guarded name stays green.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { disablesModelInvocation, forFile, read } from "./helpers/text";

const REPO_ROOT = process.cwd();

// The three prose surfaces this file exists to pin.
const SURFACES = [
  join("script", "dev-install-antigravity"),
  join("script", "dev-install-codex"),
  join("docs", "cross-host-portability.md"),
];

// The guarded set as a deliberate list. This is the creep fence: a fourth
// skill setting the flag is a decision that must update this list, and
// updating it forces every surface below to name the new skill.
const EXPECTED_GUARDED = ["pr-rebase", "pr-watch-as-reviewer", "reflect"];

// Defensive read: a missing file reads as "" so assertions FAIL, never throw.
function surface(relative: string): string {
  const absolute = join(REPO_ROOT, relative);
  return existsSync(absolute) ? read(absolute) : "";
}

// Skills on disk that disable model invocation, rebuilt from the filesystem
// the way tests/pr-watch-as-reviewer-skill.test.ts does, so both sides
// of the comparison below come from the same source of truth. The flag is read
// through the host's YAML parser, never a text match: this selects the class of
// files every assertion below sweeps, so a shadowed duplicate key that the host
// resolves to `false` would drop a skill out of the guarded set silently.
function guardedSkills(): string[] {
  const skillsRoot = join(REPO_ROOT, "skills");
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      if (!existsSync(join(skillsRoot, name, "SKILL.md"))) return false;
      return forFile(REPO_ROOT, join("skills", name, "SKILL.md"), disablesModelInvocation);
    })
    .sort();
}

// Guarded names the text never mentions. Whole-token match, so the prose word
// "reflects" cannot stand in for the skill named `reflect` — the way a
// substring check would pass for the wrong reason.
function missingMentions(text: string, names: string[]): string[] {
  return names.filter((name) => !new RegExp(`\\b${name}\\b`).test(text));
}

describe("the guarded-skill set on disk", () => {
  test("is exactly the deliberate list", () => {
    expect(guardedSkills()).toEqual(EXPECTED_GUARDED);
  });
});

describe("every guarded skill is named on all three unpinned prose surfaces", () => {
  for (const relative of SURFACES) {
    test(`${relative} names every guarded skill`, () => {
      const text = surface(relative);
      // Guard: a missing or renamed file must fail here, not pass the sweep
      // below vacuously.
      expect(text.length).toBeGreaterThan(0);
      expect(missingMentions(text, guardedSkills())).toEqual([]);
    });
  }
});

describe("the sweep can see a positive", () => {
  // docs/testing.md, "Prove a negative check can find a positive" — a check
  // that finds nothing has not distinguished absent from blind. Point the same
  // matcher at a surface with one guarded name removed and watch it fire.

  test("a surface missing one guarded name reports exactly that name", () => {
    const antigravity = surface(SURFACES[0] ?? "");
    expect(antigravity.length).toBeGreaterThan(0);

    const withoutPrRebase = antigravity.replaceAll("pr-rebase", "some-other-skill");

    expect(missingMentions(withoutPrRebase, ["pr-rebase", "pr-watch-as-reviewer"])).toEqual([
      "pr-rebase",
    ]);
  });

  test("the whole-token matcher does not accept a longer word as a mention", () => {
    // The exact false pass a substring check would give: prose that says
    // "reflects the host's behavior" is not a mention of the `reflect` skill.
    expect(missingMentions("this reflects the host's behavior", ["reflect"])).toEqual([
      "reflect",
    ]);
  });
});
