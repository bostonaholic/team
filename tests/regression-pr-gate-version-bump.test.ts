// tests/regression-pr-gate-version-bump.test.ts
//
// L2 tripwire (free, deterministic). Regression pin for the defect where the
// `/team` orchestrator bumped the plugin version at PR-open time (PR #208):
// it ran the dev `version-bump` skill after the aggregate review gate, cut
// `## [Unreleased]` into a dated section, committed `chore(version): 0.36.0`,
// and titled the draft PR `v0.36.0 …`. A version assigned at PR-open time is
// only valid against the `main` of that moment, so it goes stale as soon as
// another PR lands and the pre-merge guard then denies the merge.
//
// Per docs/testing.md ("A tripwire asserts a contract, never a wording") this
// asserts only what a machine reads, in three blessed forms:
//
//   1. NEGATIVE SWEEP — the PR-phase runtime surface names no bumper
//      identifier. A meaning-preserving rewrite never adds back a banned
//      identifier, so this can only go red on a real regression.
//   2. TEMPLATE STRING — the section heading the gate tells the model to write
//      the bullet under (`## [Unreleased]`).
//   3. ORDERING — in the dev bumper, the land-intent precondition must precede
//      the runtime-vs-dev gate, because a bump that is mistimed is wrong no
//      matter how the runtime-vs-dev question resolves.
//
// What this deliberately does NOT assert: that any sentence phrases the
// prohibition a particular way. Whether the prose still *lands* on a model is
// an L5/L6 question (tests/team-fix.evals.ts and friends), never a regex here.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { read, squash } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";

const REPO_ROOT = join(import.meta.dir, "..");

// The two runtime files that carry the PR phase. `skills/team/SKILL.md` holds
// the orchestrator's phase table and its PR gate; `skills/team-pr/SKILL.md`
// holds the canonical PR procedure that gate delegates to.
const TEAM_SKILL = join(REPO_ROOT, "skills", "team", "SKILL.md");
const TEAM_PR_SKILL = join(REPO_ROOT, "skills", "team-pr", "SKILL.md");
// The DEV bumper (never distributed) — the skill that was wrongly invoked.
const VERSION_BUMP_SKILL = join(
  REPO_ROOT,
  ".claude",
  "skills",
  "version-bump",
  "SKILL.md",
);

// Defensive read: a missing file yields "" so content assertions fail cleanly
// rather than throwing ENOENT.
function body(path: string): string {
  return existsSync(path) ? read(path) : "";
}

// Identifiers that only exist to *perform* a version bump. Any of them inside
// the PR-phase instructions is an invitation to bump at PR-open time.
const BUMPER_IDENTIFIERS = [
  "version-bump",
  "next-version.sh",
  "chore(version)",
];

describe("regression #208: the /team PR phase never bumps the version", () => {
  for (const [label, path] of [
    ["skills/team/SKILL.md", TEAM_SKILL],
    ["skills/team-pr/SKILL.md", TEAM_PR_SKILL],
  ] as const) {
    test(`${label} exists`, () => {
      expect(existsSync(path)).toBe(true);
    });

    // The PR-phase surface may FORBID bumping; it must never name the machinery
    // that does it. Naming the dev bumper from a distributed runtime skill is
    // also a layering violation — the bumper lives under .claude/.
    test(`${label} names no bumper identifier`, () => {
      const text = body(path);
      const found = BUMPER_IDENTIFIERS.filter((id) => text.includes(id));
      expect(found).toEqual([]);
    });
  }

  // The PR module owns changelog behavior; the coordinator only dispatches it.
  test("team-pr names [Unreleased] and team delegates the PR phase", () => {
    expect(squash(body(TEAM_PR_SKILL))).toContain("[Unreleased]");
    expect(loadsSkill(body(TEAM_SKILL), "team-pr")).toBe(true);
    expect(squash(body(TEAM_SKILL))).not.toContain("[Unreleased]");
  });
});

describe("regression #208: the dev bumper gates on timing before runtime-vs-dev", () => {
  const text = body(VERSION_BUMP_SKILL);
  // Step headings are stable structure (docs/testing.md blesses "section
  // headings, and the order of two sections"). The land-intent gate is the
  // unnumbered precondition heading; the runtime-vs-dev gate is a numbered step.
  const lines = text.split("\n");
  const intentIdx = lines.findIndex((line) =>
    /^#{2,4}\s.*\bland intent\b/i.test(line),
  );
  const runtimeGateIdx = lines.findIndex((line) =>
    /^#{2,4}\s*\d+\.\s*runtime-vs-dev gate/i.test(line),
  );

  test("a land-intent precondition heading is present", () => {
    expect(intentIdx).toBeGreaterThanOrEqual(0);
  });

  test("the runtime-vs-dev gate heading is present", () => {
    expect(runtimeGateIdx).toBeGreaterThanOrEqual(0);
  });

  test("the land-intent gate precedes the runtime-vs-dev gate", () => {
    // Compared as a pair so a missing heading (-1) cannot satisfy the ordering
    // vacuously — both indices must be real and in order.
    expect({ ordered: intentIdx >= 0 && intentIdx < runtimeGateIdx }).toEqual({
      ordered: true,
    });
  });
});

describe("regression #208: the invariant script states a merge condition, not an order to bump now", () => {
  const SCRIPT = join(
    REPO_ROOT,
    ".github",
    "scripts",
    "version-bump-required.sh",
  );
  const script = body(SCRIPT);

  // The bare imperative `Run version-bump.` read as "bump now" wherever it was
  // seen, including on an open draft PR where exit 1 is the expected state.
  // Banning the bare sentinel is a negative sweep: a rewrite of the verdict
  // never reintroduces it.
  test("the runtime-no-bump verdict is not the bare imperative `Run version-bump.`", () => {
    expect(script).not.toContain("Run version-bump.");
  });

  // The replacement sentinel is load-bearing: pre-merge-guard.mjs and the dev
  // bumper's step 0 both route on it. `tests/version-bump-skill.test.ts` pins
  // the script↔skill pairing; this pins the phrasing carrying the timing.
  test("the verdict states the condition on merging", () => {
    expect(script).toContain("cannot merge until version-bump runs at land time");
  });
});
