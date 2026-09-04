// tests/how-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `how` RUNTIME skill
// (skills/how/SKILL.md) — a standalone architectural-explanation utility
// distributed to Team's users. It answers "how does X work" by tracing
// simple targets inline and fanning read-only Explore explorers over
// complex ones, with an optional fresh-context critique mode on top.
// It performs no writes and no pushes.
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
// how is a RUNTIME skill — under skills/ (distributed), not .claude/.
const SKILL = join(REPO_ROOT, "skills", "how", "SKILL.md");

// Defensive read: missing file → "" so content assertions FAIL (not throw).
function body(): string {
  return existsSync(SKILL) ? read(SKILL) : "";
}
function fm(): string {
  return existsSync(SKILL) ? frontmatter(read(SKILL)) : "";
}
// Slice between two markers, or "" when the start marker is absent —
// content assertions against "" fail cleanly.
function sliceBetween(startMarker: string, endMarker: string): string {
  const text = body();
  const start = text.indexOf(startMarker);
  if (start < 0) return "";
  const rest = text.slice(start + startMarker.length);
  const end = rest.indexOf(endMarker);
  return end >= 0 ? rest.slice(0, end) : rest;
}
// Index of a heading at line start — an inline backticked mention of the
// same text (e.g. "per `## Output format`") must not satisfy or reorder it.
function headingIndex(heading: string): number {
  return body().indexOf(`\n${heading}\n`);
}

describe("how skill: runtime standalone utility frontmatter", () => {
  test("skill file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(SKILL)).toBe(true);
  });

  test("frontmatter declares name: how", () => {
    expect(/^name:\s*how\s*$/m.test(fm())).toBe(true);
  });

  test("frontmatter declares effort: medium (bounded-judgment tier)", () => {
    expect(/^effort:\s*medium\s*$/m.test(fm())).toBe(true);
  });

  test("frontmatter carries argument-hint (subsystem or question)", () => {
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

describe("how skill: section contract", () => {
  test("carries every pinned section heading", () => {
    expect(headingIndex("## Input")).toBeGreaterThanOrEqual(0);
    expect(headingIndex("## Explain mode")).toBeGreaterThanOrEqual(0);
    expect(headingIndex("### Explorer brief")).toBeGreaterThanOrEqual(0);
    expect(headingIndex("## Output format")).toBeGreaterThanOrEqual(0);
    expect(headingIndex("## Critique mode")).toBeGreaterThanOrEqual(0);
    expect(headingIndex("## Rules")).toBeGreaterThanOrEqual(0);
  });

  test("sections appear in the pinned order — critique sits after the explanation machinery", () => {
    const input = headingIndex("## Input");
    const explain = headingIndex("## Explain mode");
    const brief = headingIndex("### Explorer brief");
    const output = headingIndex("## Output format");
    const critique = headingIndex("## Critique mode");
    const rules = headingIndex("## Rules");
    expect(input).toBeGreaterThanOrEqual(0);
    expect(explain).toBeGreaterThan(input);
    expect(brief).toBeGreaterThan(explain);
    expect(output).toBeGreaterThan(brief);
    expect(critique).toBeGreaterThan(output);
    expect(rules).toBeGreaterThan(critique);
  });

  test("references the progress-tracking convention", () => {
    expect(body()).toContain("skills/principle-progress-tracking/SKILL.md");
  });
});

describe("how skill: dispatch contract", () => {
  test("dispatches explorers as read-only Explore subagents", () => {
    expect(body()).toContain("subagent_type: Explore");
  });

  test("falls back inline when dispatch is unavailable (optimization, never dependency)", () => {
    expect(body()).toContain(
      "skills/principle-optimization-never-dependency/SKILL.md",
    );
  });

  test("evidence bar is file:line per researching-codebases", () => {
    const t = body();
    expect(t).toContain("file:line");
    expect(t).toContain("skills/researching-codebases/SKILL.md");
  });
});

describe("how skill: critique-mode vocabulary", () => {
  test("critics are fresh-context per generator-evaluator", () => {
    const s = sliceBetween("## Critique mode", "\n## ");
    expect(s).toContain("skills/principle-generator-evaluator/SKILL.md");
  });

  test("findings are rated structural / concern / observation", () => {
    const s = sliceBetween("## Critique mode", "\n## ");
    // Guard: a missing section must fail, not vacuously pass.
    expect(s.length).toBeGreaterThan(0);
    expect(s).toContain("structural");
    expect(s).toContain("concern");
    expect(s).toContain("observation");
  });

  test("lead judgment sorts into Act on / Consider / Noted / Dismissed", () => {
    const s = sliceBetween("## Critique mode", "\n## ");
    expect(s).toContain("Act on");
    expect(s).toContain("Consider");
    expect(s).toContain("Noted");
    expect(s).toContain("Dismissed");
  });

  test("line-level review is routed to code-review, not critiqued here", () => {
    const s = sliceBetween("## Critique mode", "\n## ");
    expect(s).toContain("code-review");
  });
});

describe("how skill: companions and handoffs", () => {
  test("cites the why skill as its motivation companion", () => {
    expect(body()).toContain("skills/why/SKILL.md");
  });

  test("hands motivation questions to why via a Skill-tool load", () => {
    expect(loadsSkill(body(), "why")).toBe(true);
  });
});

describe("how skill: read-only — no writes, no pushes", () => {
  test("never pushes and never forces", () => {
    const t = body();
    // Guard: an empty body must fail, not vacuously pass the absence checks.
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toContain("git push");
    expect(t).not.toContain("--force");
  });
});
