import { describe, expect, test } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { description, frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const SKILLS_ROOT = join(REPO_ROOT, "skills");

const LINE_BUDGETS = { entry: 150, methodology: 80, principle: 25 } as const;
const DESCRIPTION_BUDGETS = { entry: 200, methodology: 150, principle: 150 } as const;

type SkillTier = keyof typeof LINE_BUDGETS;
type BudgetReason = { lineCount?: number; descriptionLength?: number; reason: string };

// docs/testing.md normally rejects line ceilings. This is a deliberate narrow
// exception: skill source is loaded into model context, so its size is a cost
// contract. Exceptions record the current baseline until compression removes it.
const SKILL_BUDGET_REASONS: Record<string, BudgetReason> = {};

type SkillBudget = { name: string; tier: SkillTier; lineCount: number; descriptionLength: number };

function tier(name: string, metadata: string): SkillTier {
  if (name.startsWith("principle-")) return "principle";
  return /^user-invocable:\s*false\s*$/m.test(metadata) ? "methodology" : "entry";
}

function skillBudgets(): SkillBudget[] {
  return readdirSync(SKILLS_ROOT)
    .filter((name) => statSync(join(SKILLS_ROOT, name)).isDirectory())
    .map((name) => {
      const text = read(join(SKILLS_ROOT, name, "SKILL.md"));
      const metadata = frontmatter(text);
      return {
        name,
        tier: tier(name, metadata),
        lineCount: text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length,
        descriptionLength: description(text).length,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function overBudgetWithoutReason(budgets: SkillBudget[], reasons: Record<string, BudgetReason>): string[] {
  return budgets
    .filter(({ name, tier, lineCount, descriptionLength }) =>
      (lineCount > LINE_BUDGETS[tier] || descriptionLength > DESCRIPTION_BUDGETS[tier]) && reasons[name] === undefined,
    )
    .map(({ name }) => name);
}

function reasonWithoutOverage(budgets: SkillBudget[], reasons: Record<string, BudgetReason>): string[] {
  const byName = new Map(budgets.map((budget) => [budget.name, budget]));
  return Object.keys(reasons).filter((name) => {
    const budget = byName.get(name);
    return budget === undefined || (budget.lineCount <= LINE_BUDGETS[budget.tier] && budget.descriptionLength <= DESCRIPTION_BUDGETS[budget.tier]);
  });
}

function misstatedReasons(budgets: SkillBudget[], reasons: Record<string, BudgetReason>): string[] {
  const byName = new Map(budgets.map((budget) => [budget.name, budget]));
  return Object.entries(reasons).flatMap(([name, reason]) => {
    const budget = byName.get(name);
    if (budget === undefined) return [];
    const errors: string[] = [];
    const lineOver = budget.lineCount > LINE_BUDGETS[budget.tier];
    const descriptionOver = budget.descriptionLength > DESCRIPTION_BUDGETS[budget.tier];
    if (lineOver ? reason.lineCount !== budget.lineCount : reason.lineCount !== undefined) errors.push(`${name}: line count`);
    if (descriptionOver ? reason.descriptionLength !== budget.descriptionLength : reason.descriptionLength !== undefined) {
      errors.push(`${name}: description length`);
    }
    if (reason.reason.trim() === "") errors.push(`${name}: empty reason`);
    return errors;
  });
}

describe("skill source budget", () => {
  const budgets = skillBudgets();

  test("discovers the fixed skill tiers", () => {
    expect(budgets.filter(({ tier }) => tier === "entry")).toHaveLength(23);
    expect(budgets.filter(({ tier }) => tier === "methodology")).toHaveLength(38);
    expect(budgets.filter(({ tier }) => tier === "principle")).toHaveLength(25);
  });

  test("every over-budget skill has a recorded reason", () => {
    expect(overBudgetWithoutReason(budgets, SKILL_BUDGET_REASONS)).toEqual([]);
  });

  test("every recorded reason still has an overage to justify", () => {
    expect(reasonWithoutOverage(budgets, SKILL_BUDGET_REASONS)).toEqual([]);
  });

  test("recorded reasons match the current baseline and state why", () => {
    expect(misstatedReasons(budgets, SKILL_BUDGET_REASONS)).toEqual([]);
  });

  test("budget checks detect planted violations", () => {
    const planted = [{ name: "planted", tier: "entry" as const, lineCount: 151, descriptionLength: 201 }];
    expect(overBudgetWithoutReason(planted, {})).toEqual(["planted"]);
    expect(reasonWithoutOverage(planted, { planted: { lineCount: 151, descriptionLength: 201, reason: "recorded" } })).toEqual([]);
    expect(misstatedReasons(planted, { planted: { lineCount: 150, descriptionLength: 201, reason: "recorded" } })).toEqual(["planted: line count"]);
    expect(reasonWithoutOverage([{ name: "small", tier: "entry", lineCount: 1, descriptionLength: 1 }], { small: { lineCount: 1, reason: "stale" } })).toEqual(["small"]);
    expect(misstatedReasons(planted, { planted: { lineCount: 151, descriptionLength: 200, reason: "recorded" } })).toEqual(["planted: description length"]);
    expect(misstatedReasons(planted, { planted: { lineCount: 151, descriptionLength: 201, reason: "" } })).toEqual(["planted: empty reason"]);
    expect(overBudgetWithoutReason(planted, { other: { lineCount: 151, reason: "wrong key" } })).toEqual(["planted"]);
    expect(reasonWithoutOverage([], { ghost: { lineCount: 151, reason: "stale" } })).toEqual(["ghost"]);
  });

  test("description parser handles YAML scalar styles and chomping", () => {
    expect(description("---\ndescription: \"quoted value\"\n---\n")).toBe("quoted value");
    expect(description("---\ndescription: |\n  line one\n  line two\n---\n")).toBe("line one\nline two\n");
    expect(description("---\ndescription: |-\n  line one\n  line two\n---\n")).toBe("line one\nline two");
    expect(description("---\ndescription: >\n  line one\n  line two\n---\n")).toBe("line one line two\n");
    expect(description("---\ndescription: >-\n  line one\n  line two\n---\n")).toBe("line one line two");
  });
});
