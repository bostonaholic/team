import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";

// Slice 1 (L1 pure unit) pins for the externalReviewers config-read +
// availability probe, plus the slice-3 L2 static tripwire over
// agents/code-reviewer.md.
//
// The `.mjs` module does not exist yet (test-first). Each unit test
// dynamically imports the named export it needs, so the missing module
// surfaces as a clean per-test assertion failure rather than a collection-time
// crash of the whole file.

const REPO_ROOT = process.cwd();
const MODULE = join(REPO_ROOT, "skills", "code-review", "external-reviewers.mjs");
const CODE_REVIEWER = join(REPO_ROOT, "agents", "code-reviewer.md");

// Collapse all whitespace runs so prose wrapped + indented across lines can be
// matched as one string (mirrors tests/nested-agents.test.ts).
const flat = (text: string): string => text.replace(/\s+/g, " ");
const readOrEmpty = (path: string): string => (existsSync(path) ? read(path) : "");

async function load(): Promise<Record<string, unknown>> {
  try {
    return (await import(MODULE)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

describe("KNOWN_PROVIDERS — frozen single source of truth", () => {
  test("is the frozen array [codex, gemini]", async () => {
    const { KNOWN_PROVIDERS } = await load();
    expect(KNOWN_PROVIDERS).toEqual(["codex", "gemini"]);
    expect(Object.isFrozen(KNOWN_PROVIDERS)).toBe(true);
  });
});

describe("parseConfig — degrade-to-empty on absent/empty/wrong-type input", () => {
  test("returns [] when externalReviewers is absent ({})", async () => {
    const { parseConfig } = await load();
    expect(typeof parseConfig).toBe("function");
    const fn = parseConfig as (raw: unknown) => string[];
    expect(fn({})).toEqual([]);
  });

  test("returns [] for an empty array", async () => {
    const { parseConfig } = await load();
    const fn = parseConfig as (raw: unknown) => string[];
    expect(fn([])).toEqual([]);
  });

  test("returns [] for non-array scalars (string, number, null) — never throws", async () => {
    const { parseConfig } = await load();
    const fn = parseConfig as (raw: unknown) => string[];
    expect(fn("codex")).toEqual([]);
    expect(fn(7)).toEqual([]);
    expect(fn(null)).toEqual([]);
  });

  test("returns [] for an array of unknown names (['bogus'])", async () => {
    const { parseConfig } = await load();
    const fn = parseConfig as (raw: unknown) => string[];
    expect(fn(["bogus"])).toEqual([]);
  });

  test("lowercases, trims, dedupes, and keeps only known providers", async () => {
    const { parseConfig } = await load();
    const fn = parseConfig as (raw: unknown) => string[];
    expect(fn([" Codex ", "codex", "gemini"])).toEqual(["codex", "gemini"]);
  });

  test("accepts the parsed plugin.json object carrying externalReviewers", async () => {
    const { parseConfig } = await load();
    const fn = parseConfig as (raw: unknown) => string[];
    expect(fn({ externalReviewers: ["gemini", "bogus"] })).toEqual(["gemini"]);
  });
});

describe("probeProvider — install-gated, fail-closed", () => {
  // Injected probe primitives so the unit test never spawns a real binary.
  const okWhich = async (_name: string) => "/usr/local/bin/x";
  const noWhich = async (_name: string) => null;
  const okVersion = async (_name: string) => 0;
  const badVersion = async (_name: string) => 1;

  test("true only when which resolves AND version exits 0", async () => {
    const { probeProvider } = await load();
    expect(typeof probeProvider).toBe("function");
    const fn = probeProvider as (
      name: string,
      deps: { which: (n: string) => Promise<string | null>; version: (n: string) => Promise<number>; timeoutMs?: number },
    ) => Promise<boolean>;
    expect(await fn("codex", { which: okWhich, version: okVersion })).toBe(true);
  });

  test("false when the binary does not resolve (missing CLI)", async () => {
    const { probeProvider } = await load();
    const fn = probeProvider as (
      name: string,
      deps: { which: (n: string) => Promise<string | null>; version: (n: string) => Promise<number> },
    ) => Promise<boolean>;
    expect(await fn("codex", { which: noWhich, version: okVersion })).toBe(false);
  });

  test("false on a non-zero version exit (unauthenticated-as-absent)", async () => {
    const { probeProvider } = await load();
    const fn = probeProvider as (
      name: string,
      deps: { which: (n: string) => Promise<string | null>; version: (n: string) => Promise<number> },
    ) => Promise<boolean>;
    expect(await fn("codex", { which: okWhich, version: badVersion })).toBe(false);
  });

  test("false when version throws (CLI error)", async () => {
    const { probeProvider } = await load();
    const fn = probeProvider as (
      name: string,
      deps: { which: (n: string) => Promise<string | null>; version: (n: string) => Promise<number> },
    ) => Promise<boolean>;
    const throwingVersion = async (_n: string) => {
      throw new Error("boom");
    };
    expect(await fn("codex", { which: okWhich, version: throwingVersion })).toBe(false);
  });

  test("false on a simulated timeout (hung CLI)", async () => {
    const { probeProvider } = await load();
    const fn = probeProvider as (
      name: string,
      deps: { which: (n: string) => Promise<string | null>; version: (n: string) => Promise<number>; timeoutMs?: number },
    ) => Promise<boolean>;
    const hangVersion = (_n: string) =>
      new Promise<number>((resolve) => setTimeout(() => resolve(0), 50));
    expect(await fn("codex", { which: okWhich, version: hangVersion, timeoutMs: 5 })).toBe(false);
  });
});

describe("availableReviewers — detection only gates named providers", () => {
  test("never reports a provider absent from config, even if its binary is installed", async () => {
    const { availableReviewers } = await load();
    expect(typeof availableReviewers).toBe("function");
    const fn = availableReviewers as (
      config: unknown,
      deps: { which: (n: string) => Promise<string | null>; version: (n: string) => Promise<number> },
    ) => Promise<string[]>;
    // which resolves EVERY name; only `codex` is named in config.
    const out = await fn(["codex"], {
      which: async (_n: string) => "/usr/local/bin/x",
      version: async (_n: string) => 0,
    });
    expect(out).toEqual(["codex"]);
    expect(out).not.toContain("gemini");
  });

  test("returns only the named-and-available subset", async () => {
    const { availableReviewers } = await load();
    const fn = availableReviewers as (
      config: unknown,
      deps: { which: (n: string) => Promise<string | null>; version: (n: string) => Promise<number> },
    ) => Promise<string[]>;
    // gemini named but not installed; codex named and installed.
    const out = await fn(["codex", "gemini"], {
      which: async (n: string) => (n === "codex" ? "/usr/local/bin/codex" : null),
      version: async (_n: string) => 0,
    });
    expect(out).toEqual(["codex"]);
  });

  test("empty config yields no reviewers (today's behavior)", async () => {
    const { availableReviewers } = await load();
    const fn = availableReviewers as (
      config: unknown,
      deps: { which: (n: string) => Promise<string | null>; version: (n: string) => Promise<number> },
    ) => Promise<string[]>;
    const out = await fn([], {
      which: async (_n: string) => "/usr/local/bin/x",
      version: async (_n: string) => 0,
    });
    expect(out).toEqual([]);
  });
});

describe("external-reviewers.mjs CLI contract (L2)", () => {
  test("the deterministic probe module ships beside the code-review skill", () => {
    expect(existsSync(MODULE)).toBe(true);
  });

  test("the doc comment states the exact stdout token shape so slice 3 can parse it", () => {
    const text = readOrEmpty(MODULE);
    // The CLI prints available provider names space/newline-separated, empty
    // when none. Pin that the contract is documented for the agent prose.
    expect(/stdout/i.test(text)).toBe(true);
    expect(/separated|space|newline/i.test(text)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Slice 3 — L2 static tripwire over agents/code-reviewer.md.
// String-presence only; the edge cases are pinned by the slice-1/2 unit suites.
// ---------------------------------------------------------------------------
describe("code-reviewer.md wires in external-reviewer corroboration (L2 tripwire)", () => {
  test("names the availability probe module", () => {
    expect(flat(readOrEmpty(CODE_REVIEWER))).toContain("external-reviewers.mjs");
  });

  test("names the reconciliation module", () => {
    expect(flat(readOrEmpty(CODE_REVIEWER))).toContain("reconcile-findings.mjs");
  });

  test("indicates parallel Bash invocation of named providers", () => {
    expect(/parallel/i.test(readOrEmpty(CODE_REVIEWER))).toBe(true);
  });

  test("names codex and gemini as corroborating providers", () => {
    const text = flat(readOrEmpty(CODE_REVIEWER));
    expect(text).toContain("codex");
    expect(text).toContain("gemini");
  });

  test("states the single-model — extra scrutiny annotation", () => {
    expect(flat(readOrEmpty(CODE_REVIEWER))).toContain("single-model — extra scrutiny");
  });

  test("describes a degraded / graceful / discarded-as-unparseable fallback", () => {
    expect(/degrade|graceful|discarded as unparseable/i.test(readOrEmpty(CODE_REVIEWER))).toBe(true);
  });

  test("still references code-review/SKILL.md (preserves the existing cross-reference)", () => {
    expect(readOrEmpty(CODE_REVIEWER)).toContain("code-review/SKILL.md");
  });
});
