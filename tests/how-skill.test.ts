import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";

const ROOT = process.cwd();
const SKILL = join(ROOT, "skills", "how", "SKILL.md");
const REFERENCE = join(ROOT, "skills", "how", "references", "investigation.md");
const body = () => (existsSync(SKILL) ? read(SKILL) : "");
const metadata = () => (existsSync(SKILL) ? frontmatter(read(SKILL)) : "");

describe("how skill contract", () => {
  test("keeps its public routing interface", () => {
    const fm = metadata().replace(/\s+/g, " ");
    expect(fm).toMatch(/name:\s*how/);
    expect(fm).toMatch(/effort:\s*medium/);
    expect(fm).toContain('argument-hint: "[<subsystem, feature, or question>]"');
    for (const trigger of [
      "how does X work",
      "walk me through",
      "explain the architecture",
      "where should this live",
      "/how",
    ]) {
      expect(fm).toContain(trigger);
    }
    expect(metadata()).not.toMatch(/^(disable-model-invocation|user-invocable):/m);
  });

  test("keeps explain, critique, handoff, and read-only behavior", () => {
    const text = body();
    expect(text).toContain("## Explain");
    expect(text).toContain("## Critique");
    expect(loadsSkill(text, "why")).toBe(true);
    expect(text).toContain("fresh read-only");
    expect(text).toContain("file:line");
    expect(text).not.toContain("git push");
    expect(text).not.toContain("--force");
  });

  test("loads conditional dispatch detail from one reference", () => {
    expect(body()).toContain("references/investigation.md");
    expect(existsSync(REFERENCE)).toBe(true);
    const reference = read(REFERENCE);
    expect(reference.match(/^\d+\. \*\*/gm)).toHaveLength(3);
    for (const disposition of ["structural", "concern", "observation"]) {
      expect(reference).toContain(disposition);
    }
  });
});
