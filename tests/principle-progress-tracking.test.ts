import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const SKILLS_DIR = join(REPO_ROOT, "skills");
const AGENTS_DIR = join(REPO_ROOT, "agents");

const skill = (name: string) => join(SKILLS_DIR, name, "SKILL.md");
const agent = (name: string) => join(AGENTS_DIR, `${name}.md`);
const readOrEmpty = (path: string): string => (existsSync(path) ? read(path) : "");

const PRELOAD_AGENTS = [
  "questioner",
  "design-author",
  "structure-planner",
  "planner",
  "test-architect",
  "implementer",
  "code-reviewer",
  "security-reviewer",
  "ux-reviewer",
  "technical-writer",
  "researcher",
  "verifier",
];

function skillsArrayHasProgressTracking(text: string): boolean {
  const lines = frontmatter(text).split("\n");
  let inSkills = false;
  for (const line of lines) {
    if (/^skills:\s*$/.test(line)) {
      inSkills = true;
      continue;
    }
    if (inSkills) {
      if (/^\s*-\s+principle-progress-tracking\s*$/.test(line)) return true;
      if (!/^\s*-\s+/.test(line) && line.trim() !== "") break;
    }
  }
  return false;
}

function toolsLineHasTodoWrite(text: string): boolean {
  return /^tools:.*\bTodoWrite\b/m.test(frontmatter(text));
}

describe("shared progress-tracking convention", () => {
  const progressTrackingSkill = join(SKILLS_DIR, "team", "references", "execution.md");

  test("declares an ordinary execution resource", () => {
    expect(existsSync(progressTrackingSkill)).toBe(true);
    const text = readOrEmpty(progressTrackingSkill);
    expect(text.length).toBeGreaterThan(0);
    expect(text.startsWith("---\n")).toBe(false);
    expect(existsSync(skill("principle-progress-tracking"))).toBe(false);
    expect(text).toContain("qrspi-workflow");
    expect(text).toContain("`in_progress`");
    expect(text).toContain("`completed`");
  });

  test("skill bodies do not repeat the progress-tracking blockquote", () => {
    const offenders = readdirSync(SKILLS_DIR)
      .filter((name) => statSync(join(SKILLS_DIR, name)).isDirectory())
      .map((name) => ({ name, text: read(skill(name)) }))
      .filter(({ text }) => /^> Follow `principle-progress-tracking`/m.test(text))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });
});

describe("multi-step agents read execution rules", () => {
  for (const name of PRELOAD_AGENTS) {
    test(`${name} reads execution rules and can update the ledger`, () => {
      const text = read(agent(name));
      expect(skillsArrayHasProgressTracking(text)).toBe(false);
      expect(text).toContain("[execution rules](../skills/team/references/execution.md)");
      expect(toolsLineHasTodoWrite(text)).toBe(true);
    });
  }

  test("file-finder does not preload the principle or grant TodoWrite", () => {
    const text = read(agent("file-finder"));
    expect(skillsArrayHasProgressTracking(text)).toBe(false);
    expect(toolsLineHasTodoWrite(text)).toBe(false);
  });
});

describe("orchestrator-owned ledgers retain their specific seed rules", () => {
  test("team seeds the phase ledger", () => {
    expect(read(join(SKILLS_DIR, "team", "references", "02-setup.md"))).toContain(
      "Seed the TodoWrite ledger",
    );
  });

  test("team-fix seeds the bug-fix ledger", () => {
    expect(read(join(SKILLS_DIR, "team-fix", "references", "04-setup.md"))).toContain(
      "Seed the TodoWrite ledger",
    );
  });

  test("team-implement seeds the implementation ledger", () => {
    expect(read(join(SKILLS_DIR, "team-implement", "references", "01-input.md"))).toContain(
      "Coordinate progress through TodoWrite. Seed:",
    );
  });
});
