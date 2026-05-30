// tests/static-gate.test.ts
//
// Gate tier: structural validation of every fixture and rubric on disk.
// Free, deterministic, no model calls. Replaces the bash gate from the
// previous harness iteration.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { loadFixture } from "./helpers/fixtures";

const FIXTURE_ROOT = join(process.cwd(), "evals", "fixtures");
const RUBRIC_ROOT = join(process.cwd(), "evals", "rubrics");
const FIXTURE_SIZE_CAP = 50 * 1024;

function enumerate(): { agent: string; caseName: string }[] {
  if (!existsSync(FIXTURE_ROOT)) return [];
  const out: { agent: string; caseName: string }[] = [];
  for (const agentEnt of readdirSync(FIXTURE_ROOT, { withFileTypes: true })) {
    if (!agentEnt.isDirectory()) continue;
    const agentDir = join(FIXTURE_ROOT, agentEnt.name);
    for (const caseEnt of readdirSync(agentDir, { withFileTypes: true })) {
      if (!caseEnt.isDirectory()) continue;
      out.push({ agent: agentEnt.name, caseName: caseEnt.name });
    }
  }
  return out;
}

describe("static gate: fixtures", () => {
  const cases = enumerate();

  test("at least one fixture exists", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const { agent, caseName } of cases) {
    test(`${agent}/${caseName}: frontmatter + ground-truth load`, () => {
      const fx = loadFixture(agent, caseName, FIXTURE_ROOT);
      expect(fx.frontmatter.agent).toBe(agent);
      expect(["gate", "periodic"]).toContain(fx.frontmatter.tier);
      expect(Array.isArray(fx.frontmatter.deps)).toBe(true);
      expect(fx.groundTruth.bugs.length).toBeGreaterThan(0);
      expect(typeof fx.groundTruth.minimum_detection).toBe("number");
    });

    test(`${agent}/${caseName}: fixture size <= 50 KB`, () => {
      const inputPath = join(FIXTURE_ROOT, agent, caseName, "input.md");
      const size = statSync(inputPath).size;
      expect(size).toBeLessThanOrEqual(FIXTURE_SIZE_CAP);
    });
  }

  test("every fixture has a matching rubric", () => {
    const agents = new Set(cases.map((c) => c.agent));
    for (const agent of agents) {
      const rubric = join(RUBRIC_ROOT, `${agent}.md`);
      expect(existsSync(rubric)).toBe(true);
    }
  });
});

describe("static gate: rubrics", () => {
  if (!existsSync(RUBRIC_ROOT)) return;

  for (const entry of readdirSync(RUBRIC_ROOT, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const path = join(RUBRIC_ROOT, entry.name);
    test(`${entry.name}: declares at least one numbered criterion`, () => {
      const text = readFileSync(path, "utf8");
      expect(/^\s*\d+\.\s+/m.test(text)).toBe(true);
    });
  }
});
