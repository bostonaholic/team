import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadFixture } from "./helpers/fixtures";

const FIXTURE_ROOT = join(import.meta.dir, "..", "evals", "fixtures");
const SKILLS_ROOT = join(FIXTURE_ROOT, "skills");
const RUBRICS_ROOT = join(import.meta.dir, "..", "evals", "rubrics", "skills");

const MAX_INPUT_BYTES = 50 * 1024;

/**
 * Walk evals/fixtures/skills/<skill>/<case>/ and return [skill, case] pairs.
 */
function enumerateSkills(): Array<{ skill: string; caseName: string }> {
  const out: Array<{ skill: string; caseName: string }> = [];
  for (const skillEnt of readdirSync(SKILLS_ROOT, { withFileTypes: true })) {
    if (!skillEnt.isDirectory()) continue;
    const skillDir = join(SKILLS_ROOT, skillEnt.name);
    for (const caseEnt of readdirSync(skillDir, { withFileTypes: true })) {
      if (!caseEnt.isDirectory()) continue;
      out.push({ skill: skillEnt.name, caseName: caseEnt.name });
    }
  }
  return out;
}

describe("skill-fixtures gate: integrity", () => {
  const fixtures = enumerateSkills();

  test("at least one skill fixture exists", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const { skill, caseName } of fixtures) {
    test(`skills/${skill}/${caseName} has valid frontmatter and ground truth`, () => {
      const fixture = loadFixture(`skills/${skill}`, caseName);
      expect(fixture.frontmatter.agent).toBe(`skills/${skill}`);
      expect(fixture.frontmatter.tier).toBeTruthy();
      expect(fixture.body.length).toBeGreaterThan(0);
      expect(fixture.body.length).toBeLessThanOrEqual(MAX_INPUT_BYTES);

      const gt = fixture.groundTruth;
      expect(Array.isArray(gt.bugs)).toBe(true);
      expect(gt.bugs.length).toBeGreaterThan(0);
      expect(typeof gt.minimum_detection).toBe("number");
    });

    test(`skills/${skill} has a rubric with a numbered criterion`, () => {
      const rubricPath = join(RUBRICS_ROOT, `${skill}.md`);
      expect(existsSync(rubricPath)).toBe(true);
      const rubric = readFileSync(rubricPath, "utf8");
      // at least one numbered criterion (e.g. "1." at line start)
      expect(/^\s*1\.\s+\S/m.test(rubric)).toBe(true);
    });
  }
});
