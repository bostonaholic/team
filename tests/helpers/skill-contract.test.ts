/**
 * skill-contract.test.ts — pure static checks for SKILL.md documents.
 *
 * Positive case: a real orchestration skill satisfies its contract.
 * Negative case: a deliberately-broken temp skill fails, proving the check
 * is not vacuous.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSkillContract } from "./skill-contract.ts";

const REPO_ROOT = join(import.meta.dir, "..", "..");

const tmpRoot = mkdtempSync(join(tmpdir(), "skill-contract-"));

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("checkSkillContract", () => {
  test("passes for a real orchestration skill", () => {
    const result = checkSkillContract({
      skillDir: join(REPO_ROOT, "skills", "team-plan"),
      requiredSections: ["Input", "Execution", "Completion"],
    });

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test("fails when a required section and frontmatter key are missing", () => {
    const skillDir = join(tmpRoot, "broken-skill");
    const skillPath = join(skillDir, "SKILL.md");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      skillPath,
      [
        "---",
        "name: broken-skill",
        "---",
        "",
        "Some body text with no required headings.",
        "",
        "## Inputs",
        "Only one section present.",
        "",
      ].join("\n"),
    );

    const result = checkSkillContract({
      skillDir,
      requiredSections: ["Inputs", "Procedure", "Output"],
    });

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors).toContain("Missing frontmatter key: description");
    expect(result.errors).toContain("Missing required section: ## Procedure");
    expect(result.errors).toContain("Missing required section: ## Output");
  });
});
