import { describe, expect, test } from "bun:test";
import { join } from "node:path";

// L1 pure-unit pin for the slice-2 multi-model finding reconciler.
//
// The module under test does not exist yet (test-first). Each test dynamically
// imports the named export it needs, so a missing module surfaces as a clean
// per-test failure (the import rejects / the export is undefined) rather than a
// collection-time crash of the whole file.

const MODULE = join(
  process.cwd(),
  "skills",
  "code-review",
  "reconcile-findings.mjs",
);

// Resolve the module's named exports, tolerating the not-yet-implemented state.
// Returns an empty object when the module cannot be loaded so that downstream
// assertions fail on `undefined` exports with an actionable message.
async function load(): Promise<Record<string, unknown>> {
  try {
    return (await import(MODULE)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

type Finding = {
  file: string;
  line: number;
  claim: string;
  tier?: string;
  body?: string;
};

describe("normalizePath — slash canonicalization, no lowercasing", () => {
  test("canonicalizes ./a/b.ts, a\\b.ts, and a//b.ts to the same path", async () => {
    const { normalizePath } = await load();
    expect(typeof normalizePath).toBe("function");
    const fn = normalizePath as (p: string) => string;
    const a = fn("./a/b.ts");
    const b = fn("a\\b.ts");
    const c = fn("a//b.ts");
    expect(a).toBe("a/b.ts");
    expect(b).toBe("a/b.ts");
    expect(c).toBe("a/b.ts");
  });

  test("preserves case — paths are case-sensitive", async () => {
    const { normalizePath } = await load();
    const fn = normalizePath as (p: string) => string;
    expect(fn("src/App.ts")).toBe("src/App.ts");
    expect(fn("src/App.ts")).not.toBe(fn("src/app.ts"));
  });

  test("trims surrounding whitespace", async () => {
    const { normalizePath } = await load();
    const fn = normalizePath as (p: string) => string;
    expect(fn("  a/b.ts  ")).toBe("a/b.ts");
  });
});

describe("normalizeClaim — trim, lowercase, collapse whitespace", () => {
  test("lowercases and collapses internal whitespace runs to one space", async () => {
    const { normalizeClaim } = await load();
    expect(typeof normalizeClaim).toBe("function");
    const fn = normalizeClaim as (c: string) => string;
    expect(fn("  User   MAY be   Null ")).toBe("user may be null");
  });

  test("treats trivial whitespace/case differences as the same claim", async () => {
    const { normalizeClaim } = await load();
    const fn = normalizeClaim as (c: string) => string;
    expect(fn("Off-by-one in the loop")).toBe(fn("off-by-one  in the loop"));
  });

  test("keeps substantively different sentences distinct", async () => {
    const { normalizeClaim } = await load();
    const fn = normalizeClaim as (c: string) => string;
    expect(fn("user may be null")).not.toBe(fn("index may be out of bounds"));
  });
});

describe("dedupKey — normalizePath::line::normalizeClaim", () => {
  test("composes the canonical key from the three normalized parts", async () => {
    const { dedupKey } = await load();
    expect(typeof dedupKey).toBe("function");
    const fn = dedupKey as (f: Finding) => string;
    const key = fn({ file: "./a/b.ts", line: 12, claim: "  User MAY be Null " });
    expect(key).toBe("a/b.ts::12::user may be null");
  });

  test("cosmetic path differences produce the same key", async () => {
    const { dedupKey } = await load();
    const fn = dedupKey as (f: Finding) => string;
    const k1 = fn({ file: "a\\b.ts", line: 5, claim: "leak" });
    const k2 = fn({ file: "./a/b.ts", line: 5, claim: "leak" });
    expect(k1).toBe(k2);
  });
});

describe("reconcile — default-keep grouping + corroboration count", () => {
  test("same file:line:claim across 3 models merges to one finding with corroboration 3", async () => {
    const { reconcile } = await load();
    expect(typeof reconcile).toBe("function");
    const fn = reconcile as (
      byModel: { model: string; findings: Finding[] }[],
    ) => Array<Finding & { corroboration: number; models: string[] }>;
    const f: Finding = { file: "src/a.ts", line: 9, claim: "off-by-one", tier: "Blocking" };
    const merged = fn([
      { model: "claude", findings: [f] },
      { model: "codex", findings: [{ ...f }] },
      { model: "gemini", findings: [{ ...f }] },
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0]!.corroboration).toBe(3);
  });

  test("same file:line, different claim stays as two separate findings (each corroboration 1)", async () => {
    const { reconcile } = await load();
    const fn = reconcile as (
      byModel: { model: string; findings: Finding[] }[],
    ) => Array<Finding & { corroboration: number }>;
    const merged = fn([
      { model: "claude", findings: [{ file: "src/a.ts", line: 9, claim: "user may be null" }] },
      { model: "codex", findings: [{ file: "src/a.ts", line: 9, claim: "index out of bounds" }] },
    ]);
    expect(merged.length).toBe(2);
    expect(merged.every((m) => m.corroboration === 1)).toBe(true);
  });

  test("whitespace/case-only claim differences still corroborate through formatting noise", async () => {
    const { reconcile } = await load();
    const fn = reconcile as (
      byModel: { model: string; findings: Finding[] }[],
    ) => Array<Finding & { corroboration: number }>;
    const merged = fn([
      { model: "claude", findings: [{ file: "src/a.ts", line: 9, claim: "Off-by-one in loop" }] },
      { model: "codex", findings: [{ file: "src/a.ts", line: 9, claim: "off-by-one  in loop" }] },
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0]!.corroboration).toBe(2);
  });

  test("default-keep — a single-model finding is never dropped", async () => {
    const { reconcile } = await load();
    const fn = reconcile as (
      byModel: { model: string; findings: Finding[] }[],
    ) => Array<Finding & { corroboration: number }>;
    const merged = fn([
      { model: "claude", findings: [{ file: "src/only.ts", line: 1, claim: "claude-only finding" }] },
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0]!.corroboration).toBe(1);
  });

  test("carries the tier through verbatim — reconcile never alters tier", async () => {
    const { reconcile } = await load();
    const fn = reconcile as (
      byModel: { model: string; findings: Finding[] }[],
    ) => Array<Finding & { corroboration: number }>;
    const merged = fn([
      { model: "claude", findings: [{ file: "src/a.ts", line: 9, claim: "leak", tier: "Blocking" }] },
    ]);
    expect(merged[0]!.tier).toBe("Blocking");
  });

  test("differing real paths stay separate", async () => {
    const { reconcile } = await load();
    const fn = reconcile as (
      byModel: { model: string; findings: Finding[] }[],
    ) => Array<Finding & { corroboration: number }>;
    const merged = fn([
      { model: "claude", findings: [{ file: "src/a.ts", line: 9, claim: "leak" }] },
      { model: "codex", findings: [{ file: "src/b.ts", line: 9, claim: "leak" }] },
    ]);
    expect(merged.length).toBe(2);
  });
});

describe("annotate — corroboration phrasing, tier never changed", () => {
  test("tags a finding raised by >=2 models as 'corroborated by N models'", async () => {
    const { reconcile, annotate } = await load();
    expect(typeof annotate).toBe("function");
    const rec = reconcile as (
      byModel: { model: string; findings: Finding[] }[],
    ) => Array<Finding & { corroboration: number }>;
    const ann = annotate as (
      merged: Array<Finding & { corroboration: number }>,
      totalModels: number,
    ) => Array<Finding & { annotation: string }>;
    const f: Finding = { file: "src/a.ts", line: 9, claim: "off-by-one" };
    const merged = rec([
      { model: "claude", findings: [f] },
      { model: "codex", findings: [{ ...f }] },
      { model: "gemini", findings: [{ ...f }] },
    ]);
    const out = ann(merged, 3);
    expect(out[0]!.annotation).toBe("corroborated by 3 models");
  });

  test("tags a single-model finding 'single-model — extra scrutiny'", async () => {
    const { reconcile, annotate } = await load();
    const rec = reconcile as (
      byModel: { model: string; findings: Finding[] }[],
    ) => Array<Finding & { corroboration: number }>;
    const ann = annotate as (
      merged: Array<Finding & { corroboration: number }>,
      totalModels: number,
    ) => Array<Finding & { annotation: string }>;
    const merged = rec([
      { model: "claude", findings: [{ file: "src/only.ts", line: 1, claim: "claude-only", tier: "Blocking" }] },
    ]);
    const out = ann(merged, 1);
    expect(out[0]!.annotation).toBe("single-model — extra scrutiny");
  });

  test("annotation is additive — tier is never changed by annotate", async () => {
    const { reconcile, annotate } = await load();
    const rec = reconcile as (
      byModel: { model: string; findings: Finding[] }[],
    ) => Array<Finding & { corroboration: number }>;
    const ann = annotate as (
      merged: Array<Finding & { corroboration: number }>,
      totalModels: number,
    ) => Array<Finding & { annotation: string; tier?: string }>;
    const merged = rec([
      { model: "claude", findings: [{ file: "src/a.ts", line: 9, claim: "leak", tier: "Blocking" }] },
    ]);
    const out = ann(merged, 1);
    expect(out[0]!.tier).toBe("Blocking");
  });
});
