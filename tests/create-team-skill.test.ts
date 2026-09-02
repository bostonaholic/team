// tests/create-team-skill.test.ts
//
// L2 tripwire over the dev authoring guide, .claude/skills/create-team-skill/
// SKILL.md. The guide lives under .claude/, which every skill-wide sweep in
// this repo excludes by path, so nothing pinned it — and it had drifted into
// contradicting docs/architecture.md on two load-bearing rules.
//
//   The DISPATCH rule. Three places in the guide asserted "composition never
//   goes through the skill-invocation tool". docs/architecture.md, "Two
//   reference forms, and the form is the contract", says the opposite: a LOAD
//   is encoded as a bare name passed to the Skill tool, and a CITATION as a
//   `skills/<name>/SKILL.md` path. tests/skill-tool-invocation.test.ts already
//   resolves the bare names, so the architecture rule is the one with a test
//   behind it.
//
//   The BUCKET rule. The guide's ordered test 1 routed any side-effecting
//   skill to "User-invocable only". That bucket costs the skill its model
//   reach on every host, and on Codex the flag is ignored outright. The
//   architecture rule is narrower: guard wording in the description, the
//   opt-out flag where the host honors it, and an in-run approval gate.
//
// This asserts the ABSENCE of the retired claims and the PRESENCE of the
// replacement contract — never a wording. A rewrite that keeps both encodings
// and does not re-add a retired sentence stays green.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const GUIDE = join(REPO_ROOT, ".claude", "skills", "create-team-skill", "SKILL.md");

// The three verbatim statements of the retired dispatch rule.
const RETIRED_DISPATCH_CLAIMS = [
  "composition never goes through the skill-invocation tool",
  "Never compose through the skill-invocation tool",
  "No skill invokes another through the skill-invocation tool",
];

// The retired bucket routing: a side-effecting skill sent to the bucket that
// strips its model reach.
const RETIRED_BUCKET_CLAIM = "**User-invocable only**. Never let the model auto-trigger it.";

// Defensive read: missing file → "" so content assertions FAIL (not throw).
// Read per test rather than at describe scope, where a missing guide would
// crash collection and the presence check below would never report.
function guide(): string {
  return existsSync(GUIDE) ? read(GUIDE) : "";
}

describe("the dev authoring guide agrees with docs/architecture.md", () => {
  test("the guide is present and non-empty", () => {
    // Guard: a renamed or moved guide must fail here, not turn every absence
    // check below into a green no-op.
    expect(guide().length).toBeGreaterThan(0);
  });

  test("no statement of the retired dispatch rule survives", () => {
    const surviving = RETIRED_DISPATCH_CLAIMS.filter((claim) => guide().includes(claim));
    expect(surviving).toEqual([]);
  });

  test("the absence sweep can find a positive", () => {
    // docs/testing.md, "Prove a negative check can find a positive": a clean
    // result means nothing until the same matcher fires on text known to carry
    // the claim.
    const seeded = "intro\ncomposition never goes through the skill-invocation tool\noutro";
    expect(RETIRED_DISPATCH_CLAIMS.filter((claim) => seeded.includes(claim))).toEqual([
      "composition never goes through the skill-invocation tool",
    ]);
  });

  test("the guide carries both reference forms, Load and Citation", () => {
    // The two encodings from docs/architecture.md's table. A LOAD is the bare
    // name handed to the Skill tool — the same string
    // tests/skill-tool-invocation.test.ts resolves. A CITATION keeps its path.
    expect(guide()).toContain("Call the Skill tool with");
    expect(guide()).toContain("skills/<name>/SKILL.md");
    expect(guide()).toContain("**Load**");
    expect(guide()).toContain("**Citation**");
  });

  test("ordered test 1 no longer routes a side-effecting skill to User-invocable only", () => {
    expect(guide()).not.toContain(RETIRED_BUCKET_CLAIM);
  });

  test("the bucket absence sweep can find a positive", () => {
    // Same reason as the dispatch sweep above, and the seed is spelled out
    // rather than interpolated on purpose: a typo in the literal above would
    // otherwise make the check permanently green against any guide.
    const seeded =
      "intro\n**User-invocable only**. Never let the model auto-trigger it.\noutro";
    expect(seeded).toContain(RETIRED_BUCKET_CLAIM);
  });

  test("the bucket rule names the guard clause, the flag, and the in-run gate", () => {
    // The three options docs/architecture.md and
    // skills/principle-explicit-intent/SKILL.md ("Guard the entry") allow, in
    // place of the single bucket the retired rule forced.
    expect(guide()).toContain("never infer");
    expect(guide()).toContain("disable-model-invocation");
    expect(guide()).toContain("principle-explicit-intent");
  });

  test("the guard step states both anchor sets and the 200-character bound", () => {
    // The description-writing step (§1A step 3) is where an author decides
    // where the guard lands, so it owes them the closed anchor sets and the
    // bound the tripwire enforces.
    expect(guide()).toContain("only on explicit");
    expect(guide()).toContain("never infer");
    expect(guide()).toContain("200");
  });
});
