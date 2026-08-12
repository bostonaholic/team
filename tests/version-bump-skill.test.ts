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

  test("bumps the five version strings across the four files", () => {
    expect(t).toContain(".claude-plugin/plugin.json");
    expect(t).toContain(".claude-plugin/marketplace.json");
    expect(t).toContain(".codex-plugin/plugin.json");
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

describe("version-bump skill: step 0's no-bump exit requires the script OK (#120)", () => {
  // The `git diff` quick look is orientation only; the exit itself is gated on
  // the script's dev-only+no-bump signal, so a missed runtime file stops at
  // step 0 instead of surfacing as a merge-time deny.
  const lines = body().split("\n");
  const step0Idx = lines.findIndex((line) => /^#{2,4}\s*0\.\s/.test(line));
  const step1Idx = lines.findIndex((line) => /^#{2,4}\s*1\.\s/.test(line));
  const step0Body =
    step0Idx >= 0 && step1Idx > step0Idx ? lines.slice(step0Idx, step1Idx).join("\n") : "";

  test("step 0's no-bump exit anchors on `OK: runtime_changed=false bumped=false`", () => {
    expect(step0Idx).toBeGreaterThanOrEqual(0);
    expect(step0Body).toContain("OK: runtime_changed=false bumped=false");
  });
});

describe("version-bump skill: ordering — commit, THEN assert the invariant, THEN title", () => {
  // The invariant assertion must run after the chore(version) commit (so it
  // measures the tip that will land) and before the title edit — the first
  // remote change. Asserting first keeps a failure's recovery purely local:
  // drop the commit, undo the cut, nothing has left the machine.
  const t = body();
  const commitIdx = lineIndex(t, /^#{2,4}\s*\d+\.\s*commit/i);
  const invariantIdx = lineIndex(t, /^#{2,4}\s*\d+\.\s*assert the bump invariant/i);
  const titleIdx = lineIndex(t, /^#{2,4}\s*\d+\.\s*title the pr/i);

  test("an 'Assert the bump invariant' step heading is present", () => {
    expect(invariantIdx).toBeGreaterThanOrEqual(0);
  });

  test("the invariant assertion appears AFTER the chore(version) commit step", () => {
    expect(commitIdx).toBeGreaterThanOrEqual(0);
    expect(invariantIdx).toBeGreaterThan(commitIdx);
  });

  test("the invariant assertion appears BEFORE the title step", () => {
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(invariantIdx).toBeGreaterThanOrEqual(0);
    expect(invariantIdx).toBeLessThan(titleIdx);
  });
});

describe("version-bump skill ↔ version-bump-required.sh: shared signal anchors", () => {
  // Coupling tripwire, honest limits accepted: the skill reads the script's
  // outcomes by exact output match, so the script's format literal and die
  // sentences (the script is read-only, never edited) and the skill's anchors
  // are pinned together. What this cannot guarantee: interpolated VALUES — a
  // `1`/`0` drift passes it and orphans the skill's anchors; the early runs
  // then stop by default-deny (never a wrong continue).
  const SCRIPT = join(REPO_ROOT, ".github", "scripts", "version-bump-required.sh");
  const script = existsSync(SCRIPT) ? read(SCRIPT) : "";
  const skill = body();

  test("script emits the OK printf literal `OK: runtime_changed=%s bumped=%s (%s -> %s)`", () => {
    expect(script).toContain("OK: runtime_changed=%s bumped=%s (%s -> %s)");
  });

  test("script carries the two verdict sentences", () => {
    expect(script).toContain("cannot merge until version-bump runs at land time");
    expect(script).toContain("must land with no bump");
  });

  test("skill anchors both full OK signals", () => {
    expect(skill).toContain("OK: runtime_changed=false bumped=false");
    expect(skill).toContain("OK: runtime_changed=true bumped=true");
  });

  test("skill carries the same two verdict sentences", () => {
    expect(skill).toContain("cannot merge until version-bump runs at land time");
    expect(skill).toContain("must land with no bump");
  });
});

// Regression: PR #228 changed observable behavior (it removed the `--yes`
// argument and the pre-merge confirmation) under a `fix:` subject. The old
// three-bullet level table keyed off the conventional-commit TYPE, so the patch
// row matched on `fix:`, the major row matched on the removed argument, and
// minor — the correct answer — was not reachable at all. The run stopped and
// asked a human for a level that should have been mechanical.
//
// The rule now keys off what SemVer keys off: public surface and backward
// compatibility, with the pre-1.0 scope stated. These assertions pin the spec
// identifiers that carry the rule, not the sentences that explain it.
describe("version-bump skill: the level rule is SemVer-grounded and pre-1.0 aware", () => {
  test("cites the SemVer 2.0.0 spec by URL", () => {
    const t = body();
    expect(t.length).toBeGreaterThan(0);
    expect(t).toContain("https://semver.org/spec/v2.0.0.html");
  });

  test("records the `x > 0` precondition that scopes spec items 6-8", () => {
    // The load-bearing fact. MAJOR/MINOR/PATCH are each scoped `x > 0`, so none
    // of those MUST rules binds while Team is at 0.y.z — which is why the table
    // needed a stated local convention rather than a bare SemVer reference.
    const t = body();
    expect(t.length).toBeGreaterThan(0);
    expect(/x > 0/i.test(t)).toBe(true);
  });

  test("names the major-version-zero clause and the 1.0.0 boundary", () => {
    const t = body();
    expect(t.length).toBeGreaterThan(0);
    expect(t).toContain("0.y.z");
    expect(t).toContain("1.0.0");
  });

  // Negative sweeps on the three claims that produced the wrong level. A
  // meaning-preserving rewrite never adds a banned claim back, so these cannot
  // pin wording — and each one fired against the pre-fix table.
  test("patch is no longer keyed off the `fix:` commit type", () => {
    const t = body();
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toContain("everything else (`fix:`");
  });

  test("minor is no longer keyed off the `feat:` commit type", () => {
    const t = body();
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toContain("new backward-compatible capability (`feat:`)");
  });

  test("a breaking change is no longer routed to major", () => {
    const t = body();
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toContain("breaking change to the plugin's contract");
  });
});

// Two files state the level rule. A fix applied to only one leaves the other
// teaching the defect to the next reader.
describe("version-bump ↔ docs/versioning.md: the level rule agrees on both surfaces", () => {
  const DOC = join(REPO_ROOT, "docs", "versioning.md");
  const doc = existsSync(DOC) ? read(DOC) : "";

  test("docs/versioning.md states the pre-1.0 scope", () => {
    expect(doc.length).toBeGreaterThan(0);
    expect(doc).toContain("0.y.z");
  });

  test("docs/versioning.md no longer compresses the rule to `breaking → major`", () => {
    expect(doc.length).toBeGreaterThan(0);
    expect(doc).not.toContain("breaking → major");
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
