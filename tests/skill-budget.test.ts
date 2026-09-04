import { describe, expect, test } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const SKILLS_ROOT = join(REPO_ROOT, "skills");

const LINE_BUDGETS = { entry: 150, methodology: 80, principle: 25 } as const;
const DESCRIPTION_BUDGETS = { entry: 200, methodology: 150, principle: 150 } as const;

type SkillTier = keyof typeof LINE_BUDGETS;
type BudgetReason = { lineCount?: number; descriptionLength?: number; reason: string };

// docs/testing.md normally rejects line ceilings. This is a deliberate narrow
// exception: skill source is loaded into model context, so its size is a cost
// contract. Exceptions record the current baseline until compression removes it.
const SKILL_BUDGET_REASONS: Record<string, BudgetReason> = Object.fromEntries(
  [
    ["artifact-frontmatter", 213],
    ["authoring-designs", 164],
    ["changelog", 228],
    ["cross-model-review", 291],
    ["decomposing-intent", 231],
    ["documenting-decisions", 123],
    ["eng-design-doc-review", 177],
    ["engineering-standards", 155],
    ["git-commit", 162],
    ["groom-backlog", 829],
    ["how", 193],
    ["implementing-slices", 124],
    ["nested-agents", 249],
    ["planning-implementation", 82],
    ["pr-cleanup", 622],
    ["pr-open-comments", 478],
    ["pr-rebase", 744],
    ["pr-verify", 192],
    ["pr-watch-as-author", 320],
    ["pr-watch-as-reviewer", 1090],
    ["principle-blind-the-investigator", 34],
    ["principle-bounded-loops", 36],
    ["principle-deep-agents-narrow-seams", 31],
    ["principle-evidence-over-assertion", 28],
    ["principle-explicit-intent", 36],
    ["principle-fail-closed", 29],
    ["principle-files-are-the-contract", 31],
    ["principle-fix-root-causes", 37],
    ["principle-generator-evaluator", 35],
    ["principle-human-owns-the-ends", 28],
    ["principle-idempotent-reruns", 28],
    ["principle-least-privilege", 35],
    ["principle-mechanical-gates", 27],
    ["principle-never-interpolate", 39],
    ["principle-non-blocking-waits", 52],
    ["principle-optimization-never-dependency", 31],
    ["principle-plan-present-wait", 37],
    ["principle-pre-image-first", 31],
    ["principle-progress-tracking", 46],
    ["principle-record-assumptions", 30],
    ["principle-scope-fence", 30],
    ["principle-single-source-of-truth", 29],
    ["principle-skip-loudly", 29],
    ["principle-untrusted-input-is-data", 31],
    ["product-requirements-doc", 142],
    ["qrspi-workflow", 168],
    ["reflect", 531],
    ["researching-codebases", 91],
    ["review-severity-tiers", 88],
    ["reviewing-code", 275],
    ["reviewing-designs", 158],
    ["reviewing-documentation", 85],
    ["shipit", 247],
    ["slicing-work", 117],
    ["solid", 92],
    ["sweeping-local-state", 225],
    ["systematic-debugging", 156],
    ["systems-thinking", 122],
    ["team", 575],
    ["team-fix", 213],
    ["team-implement", 240],
    ["team-pr", 429],
    ["team-worktree", 254],
    ["technical-design-doc", 175],
    ["test-driven-bug-fix", 150],
    ["test-first-development", 136],
    ["test-style", 266],
    ["tracking-tickets", 82],
    ["verifying-ux", 155],
    ["why", 206],
    ["worktree-isolation", 254],
    ["writing-prose", 274],
  ].map(([skill, lineCount]) => [
    skill,
    { lineCount, reason: "Existing skill awaits compression." },
  ]),
);

type SkillBudget = { name: string; tier: SkillTier; lineCount: number; descriptionLength: number };

function description(text: string): string {
  const lines = frontmatter(text).split("\n");
  const index = lines.findIndex((line) => line.startsWith("description:"));
  if (index < 0) return "";
  const value = lines[index]!.replace(/^description:\s*/, "");
  if (!/^[|>][-]?$/.test(value)) {
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value[0] === '"' ? value.slice(1, -1).replace(/\\([\\"])/g, "$1") : value.slice(1, -1).replace(/''/g, "'");
    }
    return value.trim();
  }
  const continuation: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (!/^\s/.test(line)) break;
    continuation.push(line.trim());
  }
  const folded = value.startsWith(">") ? continuation.join(" ").replace(/\s+/g, " ") : continuation.join("\n");
  return value.endsWith("-") ? folded.trimEnd() : `${folded.trim()}\n`;
}

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
    expect(budgets.filter(({ tier }) => tier === "methodology")).toHaveLength(37);
    expect(budgets.filter(({ tier }) => tier === "principle")).toHaveLength(24);
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
