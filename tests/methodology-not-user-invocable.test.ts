import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const ROOT = join(import.meta.dir, "..");
const SKILLS = join(ROOT, "skills");
const CATALOG = read(join(ROOT, "docs", "skills.md"));

const names = readdirSync(SKILLS)
  .filter((name) => existsSync(join(SKILLS, name, "SKILL.md")))
  .sort();

function metadata(name: string): string {
  return frontmatter(read(join(SKILLS, name, "SKILL.md")));
}

function takesArguments(name: string): boolean {
  return /^argument-hint:/m.test(metadata(name));
}

function isInternal(name: string): boolean {
  return /^user-invocable: false$/m.test(metadata(name));
}

describe("skill invocation classification", () => {
  test("the inventory is non-empty and every skill appears once in the catalog", () => {
    expect(names.length).toBeGreaterThan(60);
    for (const name of names) {
      const link = `../skills/${name}/SKILL.md`;
      expect(CATALOG.split(link).length - 1).toBe(1);
    }
  });

  test("methodologies are internal and commands are user-invocable", () => {
    const offenders = names
      .filter((name) => takesArguments(name) === isInternal(name))
      .map((name) => ({
        name,
        argumentHint: takesArguments(name),
        internal: isInternal(name),
      }));
    expect(offenders).toEqual([]);
  });

  test("the front-door pair separates command from methodology", () => {
    expect(takesArguments("code-review")).toBe(true);
    expect(isInternal("code-review")).toBe(false);
    expect(takesArguments("reviewing-code")).toBe(false);
    expect(isInternal("reviewing-code")).toBe(true);
  });
});
