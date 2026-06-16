// tests/version-bump-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the DEV `version-bump` skill
// (.claude/skills/version-bump/SKILL.md) — Team's internal land-time bumper
// (docs/plans/2026-06-15-version-at-land-time). It owns the Team-version-specific
// mechanics that do NOT belong in the generic runtime `shipit` skill: the
// four-string bump, the next-version.sh call, the [Unreleased] → dated-section
// cut, and the land-time consistency assertion. The ordering invariant —
// the changelog cut runs BEFORE the consistency assertion — is locked here.
//
// Defensive reads: a missing file → "" so content assertions FAIL cleanly
// rather than throwing ENOENT.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
// version-bump is a DEV skill — it lives under .claude/ (not distributed).
const VB_SKILL = join(REPO_ROOT, ".claude", "skills", "version-bump", "SKILL.md");

function body(): string {
  return existsSync(VB_SKILL) ? read(VB_SKILL) : "";
}
function fm(): string {
  return existsSync(VB_SKILL) ? frontmatter(read(VB_SKILL)) : "";
}
function flat(text: string): string {
  return text.replace(/\n/g, " ");
}
function lineIndex(text: string, re: RegExp): number {
  return text.split("\n").findIndex((line) => re.test(line));
}

describe("version-bump skill: it is Team's dev-internal bumper", () => {
  test("skill file exists under .claude/skills (dev-only)", () => {
    expect(existsSync(VB_SKILL)).toBe(true);
  });

  test("frontmatter declares name: version-bump", () => {
    expect(/^name:\s*version-bump\s*$/m.test(fm())).toBe(true);
  });

  test("documents the two-step dev land process (bump here, then /shipit)", () => {
    const t = flat(body());
    expect(/shipit/.test(t)).toBe(true);
    const twoStep = /bump[^.]{0,200}(then|after)[^.]{0,80}shipit|shipit[^.]{0,120}(push|wait|merge)/i.test(t);
    expect(twoStep).toBe(true);
  });
});

describe("version-bump skill: the Team-version mechanics live here", () => {
  const t = body();

  test("computes the next free version via next-version.sh", () => {
    expect(t).toContain("next-version.sh");
  });

  test("bumps the four version strings across the three files", () => {
    expect(t).toContain(".claude-plugin/plugin.json");
    expect(t).toContain(".claude-plugin/marketplace.json");
    expect(t).toContain("package.json");
  });

  test("cuts the [Unreleased] changelog into a dated section + footer", () => {
    expect(t).toContain("[Unreleased]");
    expect(/dated|## \[X\.Y\.Z\]/.test(t)).toBe(true);
    expect(/compare\/v/.test(t)).toBe(true);
  });

  test("commits the bump as chore(version): X.Y.Z", () => {
    expect(/chore\(version\)/.test(t)).toBe(true);
  });
});

describe("version-bump skill: ordering — cut BEFORE the land-time assertion", () => {
  // The released-section + footer-link invariants can only be validated after
  // the cut has written them, so the consistency assertion must follow the cut.
  // Anchor on the numbered STEP HEADINGS (each appears exactly once) so the
  // intro prose — which names both in passing — does not skew the order.
  const t = body();
  const cutIdx = lineIndex(t, /^#{2,4}\s*\d+\.\s*cut the changelog/i);
  const assertIdx = lineIndex(t, /^#{2,4}\s*\d+\.\s*land-time consistency assertion/i);

  test("a changelog-cut step heading is present", () => {
    expect(cutIdx).toBeGreaterThanOrEqual(0);
  });

  test("a land-time consistency assertion step heading is present", () => {
    expect(assertIdx).toBeGreaterThanOrEqual(0);
  });

  test("the consistency assertion appears AFTER the changelog cut", () => {
    expect(assertIdx).toBeGreaterThan(cutIdx);
  });
});
