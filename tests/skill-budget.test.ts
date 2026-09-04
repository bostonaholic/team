import { describe, expect, test } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const SKILLS_ROOT = join(REPO_ROOT, "skills");

const LINE_BUDGETS = { entry: 150, methodology: 80, principle: 25 } as const;
const DESCRIPTION_BUDGETS = { entry: 200, methodology: 150, principle: 150 } as const;

type SkillTier = keyof typeof LINE_BUDGETS;
type BudgetReason = { lineCount: number; descriptionLength: number; reason: string };

// docs/testing.md normally rejects line ceilings. This is a deliberate narrow
// exception: skill source is loaded into model context, so its size is a cost
// contract. Exceptions record the current baseline until compression removes it.
const SKILL_BUDGET_REASONS: Record<string, BudgetReason> = Object.fromEntries(
  [
    ["artifact-frontmatter", 213, 377],
    ["authoring-designs", 164, 270],
    ["changelog", 228, 140],
    ["code-review", 31, 271],
    ["conventional-comments", 61, 277],
    ["cross-model-review", 291, 260],
    ["decomposing-intent", 231, 271],
    ["documenting-decisions", 123, 212],
    ["eng-design-doc-review", 177, 489],
    ["engineering-standards", 155, 198],
    ["finding-files", 48, 278],
    ["git-commit", 162, 228],
    ["groom-backlog", 844, 1046],
    ["how", 202, 592],
    ["implementing-slices", 124, 275],
    ["nested-agents", 249, 246],
    ["planning-implementation", 82, 274],
    ["pr-cleanup", 632, 677],
    ["pr-open-comments", 493, 919],
    ["pr-rebase", 756, 868],
    ["pr-verify", 199, 465],
    ["pr-watch-as-author", 333, 808],
    ["pr-watch-as-reviewer", 1107, 1014],
    ["principle-blind-the-investigator", 34, 207],
    ["principle-bounded-loops", 36, 206],
    ["principle-deep-agents-narrow-seams", 31, 164],
    ["principle-evidence-over-assertion", 28, 181],
    ["principle-explicit-intent", 36, 189],
    ["principle-fail-closed", 29, 179],
    ["principle-files-are-the-contract", 31, 175],
    ["principle-fix-root-causes", 37, 227],
    ["principle-generator-evaluator", 35, 177],
    ["principle-human-owns-the-ends", 28, 183],
    ["principle-idempotent-reruns", 28, 163],
    ["principle-least-privilege", 35, 197],
    ["principle-mechanical-gates", 27, 157],
    ["principle-never-interpolate", 39, 217],
    ["principle-non-blocking-waits", 52, 220],
    ["principle-optimization-never-dependency", 31, 212],
    ["principle-plan-present-wait", 37, 261],
    ["principle-pre-image-first", 31, 210],
    ["principle-progress-tracking", 46, 228],
    ["principle-record-assumptions", 30, 184],
    ["principle-scope-fence", 30, 191],
    ["principle-single-source-of-truth", 29, 173],
    ["principle-skip-loudly", 29, 178],
    ["principle-untrusted-input-is-data", 31, 169],
    ["product-requirements-doc", 142, 247],
    ["product-thinking", 75, 189],
    ["qrspi-workflow", 168, 203],
    ["refactoring-to-patterns", 77, 156],
    ["reflect", 542, 817],
    ["researching-codebases", 91, 218],
    ["review-severity-tiers", 88, 348],
    ["reviewing-code", 275, 321],
    ["reviewing-designs", 159, 289],
    ["reviewing-documentation", 85, 356],
    ["reviewing-security", 79, 323],
    ["running-quality-checks", 66, 254],
    ["shipit", 256, 646],
    ["slicing-work", 117, 262],
    ["solid", 92, 162],
    ["sweeping-local-state", 232, 477],
    ["systematic-debugging", 156, 145],
    ["systems-thinking", 122, 251],
    ["team", 582, 454],
    ["team-design", 148, 303],
    ["team-fix", 220, 505],
    ["team-implement", 247, 474],
    ["team-plan", 86, 291],
    ["team-pr", 438, 615],
    ["team-research", 110, 233],
    ["team-structure", 118, 217],
    ["team-worktree", 260, 392],
    ["technical-design-doc", 175, 208],
    ["test-driven-bug-fix", 150, 177],
    ["test-first-development", 136, 159],
    ["test-style", 266, 338],
    ["tracking-tickets", 82, 384],
    ["verifying-ux", 155, 263],
    ["why", 215, 590],
    ["worktree-isolation", 254, 198],
    ["writing-prose", 274, 217],
  ].map(([skill, lineCount, descriptionLength]) => [
    skill,
    { lineCount, descriptionLength, reason: "Existing skill awaits compression." },
  ]),
);

type SkillBudget = { name: string; tier: SkillTier; lineCount: number; descriptionLength: number };

function description(text: string): string {
  const lines = frontmatter(text).split("\n");
  const index = lines.findIndex((line) => line.startsWith("description:"));
  if (index < 0) return "";
  const value = lines[index]!.replace(/^description:\s*/, "");
  if (value !== "|" && value !== ">") return value.trim();
  const continuation: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (!/^\s/.test(line)) break;
    continuation.push(line);
  }
  return continuation.join(" ").replace(/\s+/g, " ").trim();
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
    if (reason.lineCount !== budget.lineCount) errors.push(`${name}: line count`);
    if (reason.descriptionLength !== budget.descriptionLength) errors.push(`${name}: description length`);
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
  });
});
