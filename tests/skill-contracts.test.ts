// tests/skill-contracts.test.ts
//
// Free structural contract checks for the 11 orchestration skills. Runs on
// every PR via harness-checks.yml (no EVALS flag, no model calls). Each skill
// must satisfy the contract from tests/helpers/skill-contract.ts:
//   - SKILL.md exists,
//   - frontmatter carries `name` + `description`,
//   - every required `## ` section heading is present,
//   - every repo-relative path the body references actually resolves.
//
// requiredSections are chosen conservatively by reading the 11 SKILL.md files
// and asserting only headings that genuinely exist:
//   - All 10 `team-*` router skills share exactly one universal `## ` section:
//     `## Input`. (`Execution`/`Completion` are common to most but NOT to
//     `team`, which uses `## The Phase Loop` / `## Rules`, so asserting them
//     would false-fail.)
//   - `worktree-isolation` is a methodology skill with a different shape
//     (Single-repo / Multi-repo / Lifecycle / Fallback ...) and shares no
//     heading with the router skills, so it is contract-checked on its
//     frontmatter + referenced paths only (no required section).
// Every skill is still validated for frontmatter keys and resolvable paths.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkSkillContract } from "./helpers/skill-contract";

const REPO_ROOT = join(import.meta.dir, "..");

// The 10 `team-*` router skills all expose `## Input`.
const ROUTER_SKILLS = [
  "team",
  "team-fix",
  "team-question",
  "team-research",
  "team-design",
  "team-structure",
  "team-plan",
  "team-worktree",
  "team-implement",
  "team-pr",
] as const;

// Methodology orchestration skill — frontmatter + paths only, no shared section.
const METHODOLOGY_SKILLS = ["worktree-isolation"] as const;

describe("orchestration skill contracts (11)", () => {
  for (const skill of ROUTER_SKILLS) {
    test(`${skill} satisfies frontmatter + Input section + path contract`, () => {
      const result = checkSkillContract({
        skillDir: join(REPO_ROOT, "skills", skill),
        requiredSections: ["Input"],
      });
      expect(result.errors).toEqual([]);
      expect(result.ok).toBe(true);
    });
  }

  for (const skill of METHODOLOGY_SKILLS) {
    test(`${skill} satisfies frontmatter + path contract`, () => {
      const result = checkSkillContract({
        skillDir: join(REPO_ROOT, "skills", skill),
        requiredSections: [],
      });
      expect(result.errors).toEqual([]);
      expect(result.ok).toBe(true);
    });
  }
});

describe("contract catches drift (negative case)", () => {
  test("a skill missing a required section + frontmatter key fails loudly", () => {
    const dir = mkdtempSync(join(tmpdir(), "skill-contract-drift-"));
    try {
      // Frontmatter is missing `description`; body has no `## Input` heading.
      writeFileSync(
        join(dir, "SKILL.md"),
        "---\nname: broken\n---\n\n# Broken\n\n## Setup\n\nNo Input section here.\n",
        "utf8",
      );
      const result = checkSkillContract({
        skillDir: dir,
        requiredSections: ["Input"],
        repoRoot: REPO_ROOT,
      });
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContain("Missing frontmatter key: description");
      expect(result.errors).toContain("Missing required section: ## Input");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a skill dir with no SKILL.md fails", () => {
    const dir = mkdtempSync(join(tmpdir(), "skill-contract-empty-"));
    try {
      const result = checkSkillContract({
        skillDir: dir,
        requiredSections: ["Input"],
      });
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
