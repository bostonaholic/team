// tests/codex-skill-catalog.test.ts
//
// L1 + L2 (free, deterministic): Team's footprint in the host's shared skills
// catalog.
//
// Codex renders every installed skill — Team's, every other plugin's, and the
// host's own — into ONE list, `- <name>: <description> (file: <path>)`, capped
// at 8,000 characters, or 2% of the context window in tokens. Over the cap it
// shortens descriptions round-robin, so one plugin's long descriptions shorten
// every other plugin's. Past that it drops skills off the list entirely.
// Constants and render format: codex-rs/ext/skills/src/render.rs, codex-cli
// 0.153.4.
//
// Team cannot tell whether that cap is exceeded. The other tenants are not
// visible from this repo, the host ships skills of its own, and the cap moves
// with the model. So nothing here asserts that Team fits — that claim is not
// Team's to make.
//
// What this file asserts is what Team CONTRIBUTES. Team is one tenant of a pool
// it cannot measure, so it spends as little of that pool as the triggers allow
// and leaves the rest for its neighbors. The two fleet ceilings are a RATCHET:
// lower them when compression lands, never raise them to admit a new skill. A
// ceiling may not sit more than RATCHET_SLACK_CHARS above the measured
// footprint, so headroom cannot be bought in advance and every raise shows up
// in the diff as a raise.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { skillNames } from "./helpers/skill-refs";
import { description, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const SKILLS_ROOT = join(REPO_ROOT, "skills");

// Codex's per-skill hard caps. A description is cut to the first at the point
// of render; a name past the second is rejected by its skill validator.
const MAX_CATALOG_SKILL_DESCRIPTION_CHARS = 1_024;
const MAX_SKILL_NAME_CHARS = 64;

// Team's declared footprint ceilings, in characters. Not derived from Codex's
// budget — Team's share of a pool it cannot see is a judgement, not a
// calculation. They record what Team spends today and only ever come down.
const FLEET_DESCRIPTION_BUDGET_CHARS = 6_050;
const FLEET_CATALOG_BUDGET_CHARS = 8_550;
const RATCHET_SLACK_CHARS = 100;

// Codex aliases a plugin's shared skill root to `r<index>` and renders each
// locator relative to it (aliases.rs, host_aliases.rs). Team installs as one
// plugin whose skills share one root, so every locator is `r0/<name>/SKILL.md`.
function locator(name: string): string {
  return `r0/${name}/SKILL.md`;
}

// One catalog line, plus the newline `metadata_line_cost` adds before counting.
// This is the whole of what Team puts into the shared pool for one skill.
function catalogLineCost(name: string, text: string): number {
  return `- ${name}: ${text} (file: ${locator(name)})\n`.length;
}

type CatalogSkill = { name: string; description: string };

function catalogSkills(): CatalogSkill[] {
  return [...skillNames(REPO_ROOT)]
    .map((name) => ({ name, description: description(read(join(SKILLS_ROOT, name, "SKILL.md"))) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function descriptionChars(skills: CatalogSkill[]): number {
  return skills.reduce((total, skill) => total + skill.description.length, 0);
}

function catalogChars(skills: CatalogSkill[]): number {
  return skills.reduce((total, skill) => total + catalogLineCost(skill.name, skill.description), 0);
}

describe("shared skills catalog footprint", () => {
  const skills = catalogSkills();

  test("every skill contributes a description", () => {
    // Guard: an empty or description-less catalog would satisfy every ceiling
    // below vacuously.
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.filter((skill) => skill.description === "")).toEqual([]);
  });

  test("description text stays inside Team's declared share", () => {
    expect(descriptionChars(skills)).toBeLessThanOrEqual(FLEET_DESCRIPTION_BUDGET_CHARS);
  });

  test("the whole catalog footprint stays inside Team's declared share", () => {
    expect(catalogChars(skills)).toBeLessThanOrEqual(FLEET_CATALOG_BUDGET_CHARS);
  });

  test("the ceilings are a ratchet, not pre-bought headroom", () => {
    expect(FLEET_DESCRIPTION_BUDGET_CHARS - descriptionChars(skills)).toBeLessThanOrEqual(RATCHET_SLACK_CHARS);
    expect(FLEET_CATALOG_BUDGET_CHARS - catalogChars(skills)).toBeLessThanOrEqual(RATCHET_SLACK_CHARS);
  });

  test("no description exceeds Codex's per-skill cap", () => {
    expect(skills.filter((skill) => skill.description.length > MAX_CATALOG_SKILL_DESCRIPTION_CHARS).map((skill) => skill.name)).toEqual([]);
  });

  test("no name exceeds Codex's name cap", () => {
    expect(skills.filter((skill) => skill.name.length > MAX_SKILL_NAME_CHARS).map((skill) => skill.name)).toEqual([]);
  });

  test("the footprint measure detects planted growth", () => {
    const baseline = [{ name: "one", description: "does a thing" }];
    expect(descriptionChars(baseline)).toBe(12);
    // `- one: does a thing (file: r0/one/SKILL.md)` plus its newline.
    expect(catalogChars(baseline)).toBe(44);

    const grown = [...baseline, { name: "two", description: "does another thing" }];
    expect(descriptionChars(grown)).toBeGreaterThan(descriptionChars(baseline));
    expect(catalogChars(grown)).toBeGreaterThan(catalogChars(baseline));

    // A longer name costs twice: once in the name field, once in the locator.
    expect(catalogChars([{ name: "onex", description: "does a thing" }]) - catalogChars(baseline)).toBe(2);
  });
});
