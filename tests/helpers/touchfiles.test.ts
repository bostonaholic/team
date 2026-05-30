// tests/helpers/touchfiles.test.ts

import { afterEach, describe, expect, test } from "bun:test";

import {
  filterByTier,
  globMatch,
  globToRegex,
  selectTests,
} from "./touchfiles";

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
