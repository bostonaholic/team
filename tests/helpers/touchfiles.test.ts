// tests/helpers/touchfiles.test.ts

import { afterEach, describe, expect, test } from "bun:test";

import {
  E2E_TOUCHFILES,
  GLOBAL_TOUCHFILES,
  filterByTier,
  globMatch,
  globToRegex,
  selectTests,
} from "./touchfiles";
import { loadFixture } from "./fixtures";

const TOUCHFILES: Record<string, string[]> = {
  "alpha": ["src/alpha/**"],
  "beta": ["src/beta.ts", "src/shared/*.ts"],
};

const GLOBALS = ["tests/helpers/touchfiles.ts"];

afterEach(() => {
  delete process.env.EVALS_ALL;
  delete process.env.EVALS_TIER;
});

describe("globToRegex / globMatch", () => {
  test("single star matches within a directory segment only", () => {
    expect(globMatch("src/*.ts", "src/a.ts")).toBe(true);
    expect(globMatch("src/*.ts", "src/sub/a.ts")).toBe(false);
  });

  test("double star matches across segments", () => {
    expect(globMatch("src/**", "src/a.ts")).toBe(true);
    expect(globMatch("src/**", "src/sub/sub/a.ts")).toBe(true);
  });

  test("escapes regex specials in literal segments", () => {
    expect(globMatch("docs/plans/team-899/a.md", "docs/plans/team-899/a.md")).toBe(true);
    expect(globMatch("docs/plans/team-XXX/a.md", "docs/plans/team-899/a.md")).toBe(false);
  });

  test("anchors at start and end", () => {
    expect(globMatch("src/foo", "src/foo/bar")).toBe(false);
    expect(globMatch("src/foo", "extra/src/foo")).toBe(false);
  });
});

describe("selectTests", () => {
  test("EVALS_ALL=1 selects everything", () => {
    process.env.EVALS_ALL = "1";
    const sel = selectTests([], TOUCHFILES, GLOBALS);
    expect([...sel.selected].sort()).toEqual(["alpha", "beta"]);
    expect(sel.reason).toBe("EVALS_ALL=1");
  });

  test("changedFiles=null (git failed) runs everything", () => {
    const sel = selectTests(null, TOUCHFILES, GLOBALS);
    expect([...sel.selected].sort()).toEqual(["alpha", "beta"]);
    expect(sel.reason).toContain("git diff failed");
  });

  test("global touchfile change triggers full run", () => {
    const sel = selectTests(["tests/helpers/touchfiles.ts"], TOUCHFILES, GLOBALS);
    expect([...sel.selected].sort()).toEqual(["alpha", "beta"]);
    expect(sel.reason).toBe("global touchfile changed");
  });

  test("empty diff selects nothing", () => {
    const sel = selectTests([], TOUCHFILES, GLOBALS);
    expect([...sel.selected]).toEqual([]);
    expect(sel.reason).toBe("no changed files");
  });

  test("matching patterns select the right subset", () => {
    const sel = selectTests(["src/alpha/sub/x.ts"], TOUCHFILES, GLOBALS);
    expect([...sel.selected]).toEqual(["alpha"]);
    expect([...sel.skipped]).toEqual(["beta"]);
  });

  test("non-matching diff selects nothing without falling back", () => {
    const sel = selectTests(["docs/unrelated.md"], TOUCHFILES, GLOBALS);
    expect([...sel.selected]).toEqual([]);
  });
});

describe("filterByTier", () => {
  const TIERS = { "gate-only": "gate", "periodic-only": "periodic" } as const;

  test("undefined env returns set unchanged", () => {
    const sel = new Set<keyof typeof TIERS>(["gate-only", "periodic-only"]);
    expect([...filterByTier(sel, TIERS, undefined)].sort()).toEqual([
      "gate-only",
      "periodic-only",
    ]);
  });

  test("'gate' keeps only gate-tier tests", () => {
    const sel = new Set<keyof typeof TIERS>(["gate-only", "periodic-only"]);
    expect([...filterByTier(sel, TIERS, "gate")]).toEqual(["gate-only"]);
  });

  test("'periodic' keeps only periodic-tier tests", () => {
    const sel = new Set<keyof typeof TIERS>(["gate-only", "periodic-only"]);
    expect([...filterByTier(sel, TIERS, "periodic")]).toEqual(["periodic-only"]);
  });

  test("invalid env throws a named error", () => {
    const sel = new Set<keyof typeof TIERS>(["gate-only"]);
    expect(() => filterByTier(sel, TIERS, "bogus")).toThrow(/EVALS_TIER/);
  });
});

describe("Evaluation connection: resource selection", () => {
  const consumers = [
    { agent: "team-question", caseName: "neutral-questions", name: "team-question-neutral-questions", source: "skills/team-question/SKILL.md" },
    { agent: "team-research", caseName: "answers-seeded-questions", name: "team-research-answers-seeded-questions", source: "skills/team-research/SKILL.md" },
    { agent: "team-design", caseName: "seeded-research-and-task", name: "team-design-seeded-research-and-task", source: "skills/team-design/SKILL.md" },
    { agent: "team-structure", caseName: "seeded-design", name: "team-structure-seeded-design", source: "skills/team-structure/SKILL.md" },
    { agent: "team-plan", caseName: "seeded-structure", name: "team-plan-seeded-structure", source: "skills/team-plan/SKILL.md" },
  ];
  const cases = [
    ...consumers.map((consumer) => ({ ...consumer, resource: "skills/team/references/artifacts.md" })),
    { ...consumers[0]!, resource: "skills/team/references/external-data.md" },
  ];

  describe.each(cases)("$name / $resource", ({ agent, caseName, name, source, resource }) => {
    test("a planted resource change selects the case through both dependency declarations", () => {
      const fixture = loadFixture(agent, caseName);
      const fixtureDependencies = { [name]: fixture.frontmatter.deps };
      expect(selectTests([source], E2E_TOUCHFILES, GLOBAL_TOUCHFILES).selected.has(name)).toBe(true);
      expect(selectTests([source], fixtureDependencies, []).selected.has(name)).toBe(true);

      expect(selectTests([resource], E2E_TOUCHFILES, GLOBAL_TOUCHFILES).selected.has(name)).toBe(true);
      expect(selectTests([resource], fixtureDependencies, []).selected.has(name)).toBe(true);
      expect(selectTests(["unrelated/no-consumer.md"], fixtureDependencies, []).selected.has(name)).toBe(false);
    });
  });
});
