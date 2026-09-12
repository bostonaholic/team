// tests/pr-watch-mechanics-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `pr-watch-mechanics` RUNTIME
// methodology skill (skills/pr-watch-mechanics/SKILL.md) — the cycle timing,
// the 3-cycle soft cap, the handoff, and the three stop conditions that are
// loop mechanics rather than the action of any one watch. Both
// pr-watch-as-author and pr-watch-as-reviewer load it, so the numbers live
// here once instead of in two copies that drift.
//
// Every assertion is guarded so a not-yet-existing skill file yields a failed
// expect(), never an uncaught ENOENT.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read, squash } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";

const REPO_ROOT = process.cwd();
const SKILL = join(REPO_ROOT, "skills", "pr-watch-mechanics", "SKILL.md");
const MANIFEST = join(REPO_ROOT, "skills", "pr-watch-mechanics", "agents", "openai.yaml");
const AUTHOR = join(REPO_ROOT, "skills", "pr-watch-as-author");
const REVIEWER = join(REPO_ROOT, "skills", "pr-watch-as-reviewer");

function body(): string {
  return existsSync(SKILL) ? read(SKILL) : "";
}
function fm(): string {
  return existsSync(SKILL) ? frontmatter(read(SKILL)) : "";
}
function flat(text: string): string {
  return text.replace(/\n/g, " ");
}

describe("pr-watch-mechanics skill: methodology frontmatter", () => {
  test("skill file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(SKILL)).toBe(true);
  });

  test("frontmatter declares name: pr-watch-mechanics", () => {
    expect(/^name:\s*pr-watch-mechanics\s*$/m.test(fm())).toBe(true);
  });

  test("methodology is not user-invocable", () => {
    expect(/^user-invocable:\s*false\s*$/m.test(fm())).toBe(true);
  });

  test("methodology carries no effort and no argument-hint", () => {
    const f = fm();
    expect(f.length).toBeGreaterThan(0);
    expect(/^effort:/m.test(f)).toBe(false);
    expect(/^argument-hint:/m.test(f)).toBe(false);
  });

  test("carries an openai.yaml manifest", () => {
    expect(existsSync(MANIFEST)).toBe(true);
  });
});

describe("pr-watch-mechanics skill: the cycle contract", () => {
  test("the cycle wait is one backgrounded sleep-then-poll call, not foreground chunks", () => {
    // A foreground wait dies at the harness ceiling (600s in Claude Code) and
    // costs a turn per fragment. The cycle must emit one backgrounded call.
    const t = body();
    expect(t).toContain("sleep 1860");
    expect(t).toContain("run_in_background: true");
    expect(t).toContain("principle-non-blocking-waits");
    expect(t).not.toContain("sleep 600");
  });

  test("the bound is 3 cycles and is declared with the loop", () => {
    const t = flat(body());
    expect(t).toContain("Soft cap: 3 cycles");
    expect(t).toContain("principle-bounded-loops");
  });

  test("the soft cap hands off to the scheduled job and never self-re-arms", () => {
    const t = flat(body());
    expect(t).toContain("pr-watch.sh");
    expect(t).toContain("only on explicit user request");
  });

  test("owns the three stop conditions that are loop mechanics", () => {
    const t = flat(body());
    expect(t).toContain("User interrupt");
    expect(t).toContain("3 consecutive poll failures");
  });
});

describe("pr-watch-mechanics skill: both watches load it", () => {
  // Guarded per-skill read: SKILL.md plus its numbered references, matching
  // how each watch skill's own tripwire assembles its body.
  function watchBody(dir: string): string {
    const skill = join(dir, "SKILL.md");
    const refs = join(dir, "references");
    if (!existsSync(skill) || !existsSync(refs)) return "";
    const { readdirSync } = require("node:fs");
    return [
      read(skill),
      ...readdirSync(refs)
        .filter((name: string) => /^\d\d-.*\.md$/.test(name))
        .sort()
        .map((name: string) => read(join(refs, name))),
    ].join("\n");
  }

  test("pr-watch-as-author loads it", () => {
    expect(loadsSkill(watchBody(AUTHOR), "pr-watch-mechanics")).toBe(true);
  });

  test("pr-watch-as-reviewer loads it", () => {
    expect(loadsSkill(watchBody(REVIEWER), "pr-watch-mechanics")).toBe(true);
  });

  test("neither watch restates the interval it delegates", () => {
    // The drift this extraction exists to prevent: one copy edited, one missed.
    expect(watchBody(AUTHOR)).not.toContain("sleep 1860");
    expect(watchBody(REVIEWER)).not.toContain("sleep 1860");
  });
});

// The third-party definition both watch skills consume for their own
// "Third-party participant" stop condition — defined once here, owned by
// neither consumer, and this skill still owns exactly three stop conditions,
// never four.
describe("pr-watch-mechanics skill: third-party definition", () => {
  // The new section, isolated by its own heading. An absent heading yields
  // "" so the assertions below fail rather than reading past unrelated prose.
  function thirdPartySection(): string {
    const heading = "## Third-party definition";
    const t = squash(body());
    const start = t.indexOf(heading);
    if (start < 0) return "";
    const rest = t.slice(start + heading.length);
    const next = rest.search(/##\s/);
    return next >= 0 ? rest.slice(0, next) : rest;
  }

  test("adds a ## Third-party definition section without inflating the three mechanics-owned stop conditions", () => {
    const t = squash(body());
    expect(t).toContain("## Third-party definition");
    // The lock this section must not break: mechanics still owns three, never four.
    expect(t).toContain("Three stop conditions are loop mechanics");
    expect(t).not.toContain("Four stop conditions");
  });

  test("defines a third login as neither the viewer's nor the thread's original counterpart's login", () => {
    const section = thirdPartySection();
    expect(section.length).toBeGreaterThan(0);
    expect(section).toContain("third login");
    expect(section).toContain("neither the viewer's");
    expect(section).toContain("original counterpart");
  });

  test("scopes the definition to a thread marked isResolved: false", () => {
    const section = thirdPartySection();
    expect(section.length).toBeGreaterThan(0);
    expect(section).toContain("isResolved: false");
  });

  test("a null comment author counts as a third-party login", () => {
    const section = thirdPartySection();
    expect(section.length).toBeGreaterThan(0);
    expect(section).toContain("null");
    expect(section).toContain("third-party login");
  });
});
