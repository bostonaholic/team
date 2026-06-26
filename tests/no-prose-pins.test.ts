// tests/no-prose-pins.test.ts
//
// Meta-tripwire (TESTING.md §6) enforcing the prose-pin prohibition (TESTING.md
// §2 — "the line this layer must not cross").
//
// A *deterministic* test of a skill asserts STRUCTURAL / WIRING contracts
// (frontmatter tool grants, agent->skill load links, registry<->agents sync,
// reference-target existence). It must NEVER assert the INSTRUCTION PROSE of a
// skill or agent body — that it contains a philosopher's name, a lens slogan,
// or a verbatim heading list. Pinning prose tests word-presence, not behavior;
// that coverage belongs in an eval (L5/L6), driven against a fixture built to
// make the behavior observable.
//
// This guard is deterministic and free. It does two things:
//
//   1. MEMBERSHIP FREEZE — the set of test files allowed to read a skills/** or
//      agents/** markdown file and assert on its content is frozen in ALLOWED.
//      A NEW file joining the set must be consciously allowlisted here, where PR
//      review decides whether the new assertions are wiring (allowed) or prose
//      pins (forbidden — make them an eval instead).
//
//   2. RATCHET — each allowlisted file carries a CEILING on its count of
//      skill/agent-body content assertions; the count may only stay flat or
//      fall, never grow. methodology.test.ts and protocol.test.ts are the two
//      legacy files dense with prose pins; their documented target is 0.
//      Workstream C removes the pins, relocates the genuine wiring invariants
//      into tests/wiring.test.ts (added to ALLOWED then), and lowers these two
//      ceilings to 0 / drops the files from ALLOWED.

import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";

const TESTS_DIR = join(process.cwd(), "tests");

// A test file "asserts on skill/agent markdown" when it builds a path constant
// referencing the skills/ or agents/ trees, e.g. join(REPO_ROOT, "skills", ...).
// This is the prose-pin surface; a comment that merely mentions SKILL.md, or a
// git fixture that writes a "skills/foo/SKILL.md" string, does not trip it. (The
// regex does not match its own definition: after the opening quote comes "(".)
const SKILL_AGENT_REF = /"(skills|agents)"/;

// Content matchers applied to file text. Deliberately broad — a ratchet cares
// about direction (no growth), not a perfect prose-vs-wiring classification.
const BODY_ASSERTION = /\.toContain\(|\.toMatch\(|\)\.test\(|\.test\(\s*(read|flat|body)\b/g;

function source(file: string): string {
  return read(join(TESTS_DIR, file));
}

function testFiles(): string[] {
  return readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith(".test.ts"))
    .sort();
}

function filesAssertingOnSkillMd(): string[] {
  return testFiles().filter((f) => SKILL_AGENT_REF.test(source(f)));
}

function bodyAssertionCount(file: string): number {
  return (source(file).match(BODY_ASSERTION) ?? []).length;
}

// The frozen membership set: every test file permitted to assert on a
// skill/agent markdown body. wiring.test.ts is the sanctioned home for those
// invariants (Workstream C deleted the prose-pin files methodology.test.ts and
// protocol.test.ts and moved their wiring keepers there). Adding a new entry is
// the review checkpoint for "is this wiring, or a prose pin?".
const ALLOWED = new Set<string>([
  "architecture.test.ts",
  "discover-topic.test.ts", // bash<->JS drift tripwire (wiring); lands with the discovery PR
  "nested-agents.test.ts",
  "no-prose-pins.test.ts", // this file (defensive; not actually a member)
  "progress-tracking.test.ts",
  "shipit-skill.test.ts",
  "version-bump-skill.test.ts",
  "wiring.test.ts", // the wiring/config invariant home
  "worktree-detection.test.ts",
]);

// Per-file ceilings on skill/agent-body content assertions, frozen to prevent
// growth (push new assertions into wiring.test.ts, not back across the suite).
// wiring.test.ts is intentionally unceilinged — it is the destination.
const CEILING: Record<string, number> = {
  "architecture.test.ts": 22,
  "nested-agents.test.ts": 16,
  "progress-tracking.test.ts": 12,
  "shipit-skill.test.ts": 11,
  "version-bump-skill.test.ts": 5,
};

describe("no prose pins (TESTING.md §2 / §6 meta-tripwire)", () => {
  test("no test file asserts on a skill/agent body outside the allowlist", () => {
    const offenders = filesAssertingOnSkillMd().filter((f) => !ALLOWED.has(f));
    // A new offender is almost always a prose pin. If it is a legitimate wiring
    // invariant, add it to ALLOWED (and TESTING.md's wiring home) deliberately.
    expect(offenders).toEqual([]);
  });

  test("body-assertion counts never exceed their ratchet ceiling", () => {
    const overBudget: string[] = [];
    for (const [file, ceiling] of Object.entries(CEILING)) {
      const n = bodyAssertionCount(file);
      if (n > ceiling) overBudget.push(`${file}: ${n} > ${ceiling}`);
    }
    expect(overBudget).toEqual([]);
  });

  test("every ratcheted file is allowlisted (no orphan ceilings)", () => {
    const orphans = Object.keys(CEILING).filter((f) => !ALLOWED.has(f));
    expect(orphans).toEqual([]);
  });
});
