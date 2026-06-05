// tests/static-gate.test.ts
//
// Gate tier: structural validation of every fixture and rubric on disk.
// Free, deterministic, no model calls. Replaces the bash gate from the
// previous harness iteration.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { loadFixture } from "./helpers/fixtures";
import { E2E_TOUCHFILES } from "./helpers/touchfiles";

const FIXTURE_ROOT = join(process.cwd(), "evals", "fixtures");
const RUBRIC_ROOT = join(process.cwd(), "evals", "rubrics");
const TESTS_ROOT = join(process.cwd(), "tests");
const PACKAGE_JSON = join(process.cwd(), "package.json");
const EVALS_WORKFLOW = join(
  process.cwd(),
  ".github",
  "workflows",
  "behavioral-evals.yml",
);
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

  test("every fixture/rubric pair is listed in E2E_TOUCHFILES", () => {
    const globs = Object.values(E2E_TOUCHFILES).flat();
    for (const { agent, caseName } of cases) {
      expect(globs).toContain(`evals/fixtures/${agent}/${caseName}/**`);
      expect(globs).toContain(`evals/rubrics/${agent}.md`);
      expect(globs).toContain(`tests/${agent}.evals.ts`);
    }
  });
});

// The behavioral-evals workflow spawns the `claude` CLI live
// (tests/helpers/session-runner.ts). A scheduled run is the only place this
// fires, so a missing CLI install or missing agent credentials surfaces only
// once a week, in CI, with no PR signal. These guards keep that contract
// visible in the free gate that runs on every PR.
describe("static gate: behavioral-evals workflow", () => {
  const workflow = existsSync(EVALS_WORKFLOW)
    ? readFileSync(EVALS_WORKFLOW, "utf8")
    : "";

  test("workflow file exists", () => {
    expect(existsSync(EVALS_WORKFLOW)).toBe(true);
  });

  test("installs the Claude Code CLI before spawning the agent", () => {
    // The live suite calls spawn("claude", ...); without this install the
    // step dies with `ENOENT: claude not in $PATH`.
    expect(workflow).toContain("@anthropic-ai/claude-code");
  });

  test("exposes ANTHROPIC_API_KEY so the spawned agent can authenticate", () => {
    // EVALS_ANTHROPIC_API_KEY is namespaced for the judge only; the agent
    // under test needs its own credential or it fails auth on every run.
    // Anchor to the bare key at line start so the existing namespaced
    // EVALS_ANTHROPIC_API_KEY: entry does not satisfy this on its own.
    expect(/^\s*ANTHROPIC_API_KEY:/m.test(workflow)).toBe(true);
  });

  test("scheduled workflow includes every eval file", () => {
    const evalFiles = readdirSync(TESTS_ROOT)
      .filter((name) => name.endsWith(".evals.ts"))
      .sort();
    for (const file of evalFiles) {
      expect(workflow).toContain(`./tests/${file}`);
    }
  });
});

describe("static gate: package eval commands", () => {
  const pkg = existsSync(PACKAGE_JSON)
    ? JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
        scripts?: Record<string, string>;
      }
    : {};
  const scripts = pkg.scripts ?? {};

  test("default paid eval command stays diff-selected", () => {
    expect(scripts["test:evals"]).toContain("./tests/*.evals.ts");
    expect(scripts["test:evals"]).not.toContain("EVALS_ALL=1");
  });

  test("full paid eval command is explicit", () => {
    expect(scripts["test:evals:all"]).toContain("EVALS_ALL=1");
    expect(scripts["test:evals:all"]).toContain("./tests/*.evals.ts");
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
