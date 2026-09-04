// tests/why-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `why` RUNTIME skill
// (skills/why/SKILL.md) — a standalone design-rationale investigation
// utility distributed to Team's users. It builds a code anchor from git
// history, dispatches one read-only Explore investigator per available
// evidence category, and synthesizes a confidence-tiered, citation-backed
// answer. It performs no writes and no pushes.
//
// Every assertion is guarded so a not-yet-existing skill file yields a failed
// expect(), never an uncaught ENOENT — the mechanical gate rejects crashes,
// not clean assertion failures.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";

const REPO_ROOT = process.cwd();
// why is a RUNTIME skill — under skills/ (distributed), not .claude/.
const SKILL = join(REPO_ROOT, "skills", "why", "SKILL.md");

// Defensive read: missing file → "" so content assertions FAIL (not throw).
function body(): string {
  return existsSync(SKILL) ? read(SKILL) : "";
}
function fm(): string {
  return existsSync(SKILL) ? frontmatter(read(SKILL)) : "";
}
// Flatten newlines so multi-line prose can be matched in one regex.
function flat(text: string): string {
  return text.replace(/\n/g, " ");
}
// Index of a heading at line start — an inline backticked mention of the
// same text (e.g. "per `## Input`") must not satisfy or reorder it.
function headingIndex(heading: string): number {
  return body().indexOf(`\n${heading}\n`);
}

describe("why skill: runtime standalone utility frontmatter", () => {
  test("skill file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(SKILL)).toBe(true);
  });

  test("frontmatter declares name: why", () => {
    expect(/^name:\s*why\s*$/m.test(fm())).toBe(true);
  });

  test("frontmatter declares effort: high (calibrated-synthesis tier)", () => {
    expect(/^effort:\s*high\s*$/m.test(fm())).toBe(true);
  });

  test("frontmatter carries argument-hint (question or code target)", () => {
    expect(/^argument-hint:/m.test(fm())).toBe(true);
  });

  test("frontmatter does NOT set disable-model-invocation or user-invocable: false (read-only, both surfaces)", () => {
    const f = fm();
    // Guard: an empty frontmatter must fail, not vacuously pass the absence checks.
    expect(f.length).toBeGreaterThan(0);
    expect(/^disable-model-invocation:/m.test(f)).toBe(false);
    expect(/^user-invocable:\s*false/m.test(f)).toBe(false);
  });
});

describe("why skill: section contract", () => {
  test("carries every pinned section heading", () => {
    expect(headingIndex("## Input")).toBeGreaterThanOrEqual(0);
    expect(headingIndex("## Confidence tiers")).toBeGreaterThanOrEqual(0);
    expect(headingIndex("## Execution")).toBeGreaterThanOrEqual(0);
    expect(headingIndex("### Investigator brief")).toBeGreaterThanOrEqual(0);
    expect(headingIndex("## Output format")).toBeGreaterThanOrEqual(0);
    expect(headingIndex("## Rules")).toBeGreaterThanOrEqual(0);
  });

  test("sections appear in the pinned order", () => {
    const input = headingIndex("## Input");
    const tiers = headingIndex("## Confidence tiers");
    const execution = headingIndex("## Execution");
    const brief = headingIndex("### Investigator brief");
    const output = headingIndex("## Output format");
    const rules = headingIndex("## Rules");
    expect(input).toBeGreaterThanOrEqual(0);
    expect(tiers).toBeGreaterThan(input);
    expect(execution).toBeGreaterThan(tiers);
    expect(brief).toBeGreaterThan(execution);
    expect(output).toBeGreaterThan(brief);
    expect(rules).toBeGreaterThan(output);
  });

  test("references the progress-tracking convention", () => {
    expect(body()).toContain("skills/principle-progress-tracking/SKILL.md");
  });
});

describe("why skill: confidence vocabulary", () => {
  test("names all five confidence tiers", () => {
    const t = body();
    expect(t).toContain("Direct");
    expect(t).toContain("Supported");
    expect(t).toContain("Inferred");
    expect(t).toContain("Speculative");
    expect(t).toContain("Unknown");
  });

  test("output format carries the Sources Consulted coverage map", () => {
    expect(body()).toContain("Sources Consulted");
  });

  test("change-precursor output is the Preserve / Change / Avoid / Risk constraint set", () => {
    expect(flat(body())).toContain("Preserve / Change / Avoid / Risk");
  });
});

describe("why skill: code anchor commands", () => {
  test("anchors through git blame, follow-history, and the pickaxe", () => {
    const t = body();
    expect(t).toContain("git blame");
    expect(t).toContain("git log --oneline --follow");
    expect(t).toContain("git log -S");
  });

  test("pulls PR context through gh pr view", () => {
    expect(body()).toContain("gh pr view");
  });
});

describe("why skill: dispatch contract", () => {
  test("dispatches investigators as read-only Explore subagents", () => {
    expect(body()).toContain("subagent_type: Explore");
  });

  test("falls back inline when dispatch is unavailable (optimization, never dependency)", () => {
    expect(body()).toContain(
      "skills/principle-optimization-never-dependency/SKILL.md",
    );
  });

  test("investigators are blinded to hypotheses", () => {
    expect(body()).toContain("skills/principle-blind-the-investigator/SKILL.md");
  });

  test("skipped or empty evidence categories are reported per skip-loudly", () => {
    expect(body()).toContain("skills/principle-skip-loudly/SKILL.md");
  });

  test("claims are evidence-backed per evidence-over-assertion", () => {
    expect(body()).toContain("skills/principle-evidence-over-assertion/SKILL.md");
  });

  test("historical evidence is data per untrusted-input-is-data", () => {
    expect(body()).toContain("skills/principle-untrusted-input-is-data/SKILL.md");
  });
});

describe("why skill: companions and handoffs", () => {
  test("cites the how skill as its mechanics companion", () => {
    expect(body()).toContain("skills/how/SKILL.md");
  });

  test("hands a failure investigation to systematic-debugging via a Skill-tool load", () => {
    expect(loadsSkill(body(), "systematic-debugging")).toBe(true);
  });
});

describe("why skill: read-only — no writes, no pushes", () => {
  test("never pushes and never forces", () => {
    const t = body();
    // Guard: an empty body must fail, not vacuously pass the absence checks.
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toContain("git push");
    expect(t).not.toContain("--force");
  });
});

describe("why skill: consumer wiring", () => {
  const readOrEmpty = (path: string): string =>
    existsSync(path) ? read(path) : "";

  test("team-fix conditionally loads why for deliberate-looking behavior", () => {
    const t = readOrEmpty(join(REPO_ROOT, "skills", "team-fix", "SKILL.md"));
    expect(loadsSkill(t, "why")).toBe(true);
  });

  test("reviewing-code conditionally loads why before judging long-standing behavior", () => {
    const t = readOrEmpty(join(REPO_ROOT, "skills", "reviewing-code", "SKILL.md"));
    expect(loadsSkill(t, "why")).toBe(true);
  });

  test("systematic-debugging cites why for the design-rationale half", () => {
    const t = readOrEmpty(
      join(REPO_ROOT, "skills", "systematic-debugging", "SKILL.md"),
    );
    expect(t).toContain("skills/why/SKILL.md");
  });

  test("authoring-designs cites why as the rationale-constraint archaeology", () => {
    const t = readOrEmpty(
      join(REPO_ROOT, "skills", "authoring-designs", "SKILL.md"),
    );
    expect(t).toContain("skills/why/SKILL.md");
  });
});
