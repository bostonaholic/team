import { describe, expect, test } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { description, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const SKILLS_ROOT = join(REPO_ROOT, "skills");

// Constants mirrored from Codex, codex-rs/ext/skills/src/render.rs (codex-cli
// 0.153.4). Codex renders one catalog line per model-visible skill into a
// single budget shared by every installed skill from every plugin and root.
const DEFAULT_SKILL_METADATA_CHAR_BUDGET = 8_000;
const SKILL_DESCRIPTION_TRUNCATION_WARNING_THRESHOLD_CHARS = 100;
const MAX_CATALOG_SKILL_DESCRIPTION_CHARS = 1_024;
const MAX_SKILL_NAME_CHARS = 64;

// Codex aliases a plugin's shared skill root to `r<index>` and renders each
// locator relative to it (aliases.rs, host_aliases.rs). Team installs as one
// plugin whose 90 skills share one root, so every locator is `r0/<name>/SKILL.md`.
function locator(name: string): string {
  return `r0/${name}/SKILL.md`;
}

// `- <name>: <description> (<locator_kind>: <locator>)`, plus the newline that
// `metadata_line_cost` adds before counting.
function minimumCost(name: string): number {
  return `- ${name}: (file: ${locator(name)})\n`.length;
}

function fullCost(name: string, text: string): number {
  return `- ${name}: ${text} (file: ${locator(name)})\n`.length;
}

// Round-robin description allocation, one character at a time, so no skill
// monopolizes the leftover budget. In character mode the k-th character of a
// description costs k + 1 above the minimum line (k characters plus the space
// that separates the name from the description).
function allocateDescriptionChars(descriptionLengths: number[], limit: number): number[] {
  const allocated = descriptionLengths.map(() => 0);
  const currentExtra = descriptionLengths.map(() => 0);
  let remaining = limit;
  for (;;) {
    let changed = false;
    for (const [index, length] of descriptionLengths.entries()) {
      if (allocated[index]! >= length) continue;
      const next = allocated[index]! + 1;
      const delta = next + 1 - currentExtra[index]!;
      if (delta > remaining) continue;
      allocated[index] = next;
      currentExtra[index] = next + 1;
      remaining -= delta;
      changed = true;
    }
    if (!changed) break;
  }
  return allocated;
}

type CatalogSkill = { name: string; description: string };
type RenderReport = { totalCount: number; omittedCount: number; truncatedDescriptionChars: number };

function renderReport(skills: CatalogSkill[], budget: number): RenderReport {
  const totalCount = skills.length;
  const minimum = skills.reduce((used, skill) => used + minimumCost(skill.name), 0);
  const full = skills.reduce((used, skill) => used + fullCost(skill.name, skill.description), 0);
  if (full <= budget) return { totalCount, omittedCount: 0, truncatedDescriptionChars: 0 };

  if (minimum <= budget) {
    const lengths = skills.map((skill) => skill.description.length);
    const allocated = allocateDescriptionChars(lengths, budget - minimum);
    const truncated = lengths.reduce((total, length, index) => total + length - allocated[index]!, 0);
    return { totalCount, omittedCount: 0, truncatedDescriptionChars: truncated };
  }

  // Descriptions are gone and the names alone still overflow: Codex drops the
  // remaining skills out of the model-visible list entirely.
  let used = 0;
  let omittedCount = 0;
  let truncatedDescriptionChars = 0;
  for (const skill of skills) {
    const next = used + minimumCost(skill.name);
    if (next <= budget) {
      used = next;
      truncatedDescriptionChars += skill.description.length;
      continue;
    }
    omittedCount += 1;
    truncatedDescriptionChars += skill.description.length;
  }
  return { totalCount, omittedCount, truncatedDescriptionChars };
}

// Codex's own ceiling division, so a fractional character counts against us.
function averageTruncatedChars(report: RenderReport): number {
  if (report.totalCount === 0 || report.truncatedDescriptionChars === 0) return 0;
  return Math.floor((report.truncatedDescriptionChars + report.totalCount - 1) / report.totalCount);
}

function warns(report: RenderReport): boolean {
  return report.omittedCount > 0 || averageTruncatedChars(report) > SKILL_DESCRIPTION_TRUNCATION_WARNING_THRESHOLD_CHARS;
}

function catalogSkills(): CatalogSkill[] {
  return readdirSync(SKILLS_ROOT)
    .filter((name) => statSync(join(SKILLS_ROOT, name)).isDirectory())
    .map((name) => ({ name, description: description(read(join(SKILLS_ROOT, name, "SKILL.md"))) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

describe("Codex skill catalog budget", () => {
  const skills = catalogSkills();

  test("every description reaches Codex intact", () => {
    // Guard: an empty catalog would pass every assertion below vacuously.
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.filter((skill) => skill.description === "")).toEqual([]);
  });

  test("no skill drops out of the model-visible list", () => {
    expect(renderReport(skills, DEFAULT_SKILL_METADATA_CHAR_BUDGET).omittedCount).toBe(0);
  });

  test("the fleet does not trip Codex's description-truncation warning", () => {
    expect(averageTruncatedChars(renderReport(skills, DEFAULT_SKILL_METADATA_CHAR_BUDGET))).toBeLessThanOrEqual(
      SKILL_DESCRIPTION_TRUNCATION_WARNING_THRESHOLD_CHARS,
    );
  });

  test("no single description exceeds Codex's per-skill cap", () => {
    expect(skills.filter((skill) => skill.description.length > MAX_CATALOG_SKILL_DESCRIPTION_CHARS).map((skill) => skill.name)).toEqual([]);
  });

  test("no skill name exceeds Codex's name cap", () => {
    expect(skills.filter((skill) => skill.name.length > MAX_SKILL_NAME_CHARS).map((skill) => skill.name)).toEqual([]);
  });

  test("the budget model detects planted violations", () => {
    const roomy = [{ name: "one", description: "short" }];
    expect(warns(renderReport(roomy, DEFAULT_SKILL_METADATA_CHAR_BUDGET))).toBe(false);

    const bloated = Array.from({ length: 90 }, (_, index) => ({ name: `skill-${index}`, description: "x".repeat(300) }));
    const bloatedReport = renderReport(bloated, DEFAULT_SKILL_METADATA_CHAR_BUDGET);
    expect(bloatedReport.omittedCount).toBe(0);
    expect(warns(bloatedReport)).toBe(true);

    const crowded = Array.from({ length: 400 }, (_, index) => ({ name: `skill-${index}`, description: "short" }));
    const crowdedReport = renderReport(crowded, DEFAULT_SKILL_METADATA_CHAR_BUDGET);
    expect(crowdedReport.omittedCount).toBeGreaterThan(0);
    expect(warns(crowdedReport)).toBe(true);
  });

  test("round-robin allocation spreads the leftover budget evenly", () => {
    // Two characters buy the first description character (the character plus
    // its separating space); every later character costs one.
    expect(allocateDescriptionChars([10, 10], 4)).toEqual([1, 1]);
    expect(allocateDescriptionChars([10, 10], 6)).toEqual([2, 2]);
    // A short description stops consuming once it is whole, and the surplus
    // goes to the skill that can still use it.
    expect(allocateDescriptionChars([1, 10], 12)).toEqual([1, 9]);
  });
});
