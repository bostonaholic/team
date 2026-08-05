import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { read } from "./helpers/text";

// L1 pure-unit pins for the availability probe + invocation contract, plus L2
// static tripwires over agents/code-reviewer.md and skills/code-review/SKILL.md.
// Multi-model review is opt-out (default-on); there is no config file.
//
// Each unit test dynamically imports the named export it needs, so a missing
// module surfaces as a clean per-test assertion failure rather than a
// collection-time crash of the whole file.

const REPO_ROOT = process.cwd();
const MODULE = join(REPO_ROOT, "skills", "code-review", "external-reviewers.mjs");
const CODE_REVIEWER = join(REPO_ROOT, "agents", "code-reviewer.md");
const CODE_REVIEW_SKILL = join(REPO_ROOT, "skills", "code-review", "SKILL.md");
const TEAM_IMPLEMENT = join(REPO_ROOT, "skills", "team-implement", "SKILL.md");

// Collapse all whitespace runs so prose wrapped + indented across lines can be
// matched as one string (mirrors tests/nested-agents.test.ts).
const flat = (text: string): string => text.replace(/\s+/g, " ");
const readOrEmpty = (path: string): string => (existsSync(path) ? read(path) : "");

type Reviewer = { tool: string; model: string | null };
type ProbeDeps = {
  which: (n: string) => Promise<string | null>;
  version: (n: string) => Promise<number>;
  timeoutMs?: number;
};

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

describe("PROVIDER_INVOCATION — frozen exact-invocation contract", () => {
  type Spec = {
    binary: string;
    baseArgs: string[];
    modelFlag: string;
    promptVia: string;
  };
  const map = async () =>
    (await load()).PROVIDER_INVOCATION as { codex: Spec; gemini: Spec };

  test("is deeply frozen", async () => {
    const m = await map();
    expect(Object.isFrozen(m)).toBe(true);
    expect(Object.isFrozen(m.codex)).toBe(true);
    expect(Object.isFrozen(m.codex.baseArgs)).toBe(true);
    expect(Object.isFrozen(m.gemini)).toBe(true);
    expect(Object.isFrozen(m.gemini.baseArgs)).toBe(true);
  });

  test("codex runs the non-interactive exec subcommand under read-only sandbox", async () => {
    const m = await map();
    expect(m.codex.binary).toBe("codex");
    expect(m.codex.baseArgs).toEqual(["exec", "--sandbox", "read-only"]);
    expect(m.codex.modelFlag).toBe("-m");
    expect(m.codex.promptVia).toBe("arg");
  });

  test("gemini runs headless plan (read-only) mode with workspace trust skipped", async () => {
    const m = await map();
    expect(m.gemini.binary).toBe("gemini");
    expect(m.gemini.baseArgs).toEqual(["--approval-mode", "plan", "--skip-trust"]);
    expect(m.gemini.modelFlag).toBe("-m");
    expect(m.gemini.promptVia).toBe("-p");
  });

  test("hardcodes no model version anywhere in the contract", async () => {
    const m = await map();
    const all = JSON.stringify(m);
    // A bare version token (e.g. "gpt-5.3-codex", "gemini-3-pro") would be a
    // staleness landmine; only the read-only flags and the `-m` selector live here.
    expect(/gpt-|gemini-\d/.test(all)).toBe(false);
  });
});

describe("buildInvocation — pure argv-prefix builder", () => {
  const build = async () =>
    (await load()).buildInvocation as (tool: string, model: string | null) => string[];

  test("codex + model appends -m <model> after the read-only base args", async () => {
    const fn = await build();
    expect(typeof fn).toBe("function");
    expect(fn("codex", "gpt-5.3-codex")).toEqual([
      "codex",
      "exec",
      "--sandbox",
      "read-only",
      "-m",
      "gpt-5.3-codex",
    ]);
  });

  test("codex without a model omits -m (CLI default model)", async () => {
    const fn = await build();
    expect(fn("codex", null)).toEqual(["codex", "exec", "--sandbox", "read-only"]);
  });

  test("gemini + model appends -m <model> after the headless base args", async () => {
    const fn = await build();
    expect(fn("gemini", "gemini-3-pro")).toEqual([
      "gemini",
      "--approval-mode",
      "plan",
      "--skip-trust",
      "-m",
      "gemini-3-pro",
    ]);
  });

  test("gemini without a model omits -m (CLI default model)", async () => {
    const fn = await build();
    expect(fn("gemini", null)).toEqual([
      "gemini",
      "--approval-mode",
      "plan",
      "--skip-trust",
    ]);
  });

  test("throws on an unknown tool (fail fast, fail loud)", async () => {
    const fn = await build();
    expect(() => fn("bogus", null)).toThrow();
  });
});

describe("probeProvider — install-gated, fail-closed", () => {
  // Injected probe primitives so the unit test never spawns a real binary.
  const okWhich = async (_name: string) => "/usr/local/bin/x";
  const noWhich = async (_name: string) => null;
  const okVersion = async (_name: string) => 0;
  const badVersion = async (_name: string) => 1;

  const probe = async () =>
    (await load()).probeProvider as (n: string, d: ProbeDeps) => Promise<boolean>;

  test("true only when which resolves AND version exits 0", async () => {
    const fn = await probe();
    expect(typeof fn).toBe("function");
    expect(await fn("codex", { which: okWhich, version: okVersion })).toBe(true);
  });

  test("false when the binary does not resolve (missing CLI)", async () => {
    const fn = await probe();
    expect(await fn("codex", { which: noWhich, version: okVersion })).toBe(false);
  });

  test("false on a non-zero version exit (unauthenticated-as-absent)", async () => {
    const fn = await probe();
    expect(await fn("codex", { which: okWhich, version: badVersion })).toBe(false);
  });

  test("false when version throws (CLI error)", async () => {
    const fn = await probe();
    const throwingVersion = async (_n: string) => {
      throw new Error("boom");
    };
    expect(await fn("codex", { which: okWhich, version: throwingVersion })).toBe(false);
  });

  test("false on a simulated timeout (hung CLI)", async () => {
    const fn = await probe();
    const hangVersion = (_n: string) =>
      new Promise<number>((resolve) => setTimeout(() => resolve(0), 50));
    expect(await fn("codex", { which: okWhich, version: hangVersion, timeoutMs: 5 })).toBe(
      false,
    );
  });
});

describe("probeProviders — attempts every known provider, splits available/unavailable", () => {
  const probe = async () =>
    (await load()).probeProviders as (
      deps: ProbeDeps,
    ) => Promise<{ available: { tool: string }[]; unavailable: string[] }>;

  test("all installed ⇒ every known provider available, none skipped", async () => {
    const fn = await probe();
    expect(typeof fn).toBe("function");
    const out = await fn({
      which: async (_n: string) => "/usr/local/bin/x",
      version: async (_n: string) => 0,
    });
    expect(out.available.map((r) => r.tool).sort()).toEqual(["codex", "gemini"]);
    expect(out.unavailable).toEqual([]);
  });

  test("a missing binary is reported unavailable (attempted, not silently dropped)", async () => {
    const fn = await probe();
    const out = await fn({
      which: async (n: string) => (n === "codex" ? "/usr/local/bin/codex" : null),
      version: async (_n: string) => 0,
    });
    expect(out.available.map((r) => r.tool)).toEqual(["codex"]);
    expect(out.unavailable).toEqual(["gemini"]);
  });

  test("none installed ⇒ all reported unavailable (opt-out default still attempts)", async () => {
    const fn = await probe();
    const out = await fn({
      which: async (_n: string) => null,
      version: async (_n: string) => 0,
    });
    expect(out.available).toEqual([]);
    expect(out.unavailable.sort()).toEqual(["codex", "gemini"]);
  });
});

describe("external-reviewers.mjs CLI contract (L2)", () => {
  test("the deterministic probe module ships beside the code-review skill", () => {
    expect(existsSync(MODULE)).toBe(true);
  });

  test("default-mode doc comment documents the {available, unavailable} stdout shape", () => {
    const text = readOrEmpty(MODULE);
    expect(/stdout/i.test(text)).toBe(true);
    expect(text).toContain('"available"');
    expect(text).toContain('"unavailable"');
    // the ready-to-run fields + read-only flags in the worked example
    expect(text).toContain("invoke");
    expect(text).toContain("promptVia");
    expect(text).toContain("--sandbox");
    expect(text).toContain("read-only");
  });

  test("no config file — reads neither .claude/team.json nor the plugin manifest", () => {
    const text = readOrEmpty(MODULE);
    expect(text).not.toContain(".claude/team.json");
    expect(text).not.toContain(".claude-plugin/plugin.json");
  });
});

// ---------------------------------------------------------------------------
// L2 static tripwires. The corroboration PROCEDURE lives in the preloaded
// skills/code-review/SKILL.md (agent files are thin wrappers); code-reviewer.md
// only carries a thin pointer to it.
// ---------------------------------------------------------------------------
describe("code-reviewer.md points at the corroboration procedure (thin wrapper)", () => {
  test("frames corroboration as opt-out / per-run controllable", () => {
    expect(/opt-out|per-run|override/i.test(readOrEmpty(CODE_REVIEWER))).toBe(true);
  });

  test("names the external providers", () => {
    const text = flat(readOrEmpty(CODE_REVIEWER));
    expect(text).toContain("codex");
    expect(text).toContain("gemini");
  });

  test("points at the corroboration section of code-review/SKILL.md", () => {
    expect(readOrEmpty(CODE_REVIEWER)).toContain("code-review/SKILL.md");
  });

  test("carries no config-file or plugin-manifest reference", () => {
    const text = readOrEmpty(CODE_REVIEWER);
    expect(text).not.toContain(".claude/team.json");
    expect(text).not.toContain(".claude-plugin/plugin.json");
  });
});

describe("code-review/SKILL.md carries the corroboration procedure (L2 tripwire)", () => {
  test("names the availability probe module", () => {
    expect(flat(readOrEmpty(CODE_REVIEW_SKILL))).toContain("external-reviewers.mjs");
  });

  test("names the reconciliation module", () => {
    expect(flat(readOrEmpty(CODE_REVIEW_SKILL))).toContain("reconcile-findings.mjs");
  });

  test("indicates parallel Bash invocation of named providers", () => {
    expect(/parallel/i.test(readOrEmpty(CODE_REVIEW_SKILL))).toBe(true);
  });

  test("names codex and gemini as corroborating providers", () => {
    const text = flat(readOrEmpty(CODE_REVIEW_SKILL));
    expect(text).toContain("codex");
    expect(text).toContain("gemini");
  });

  test("bakes the EXACT read-only headless commands for codex and gemini", () => {
    const text = flat(readOrEmpty(CODE_REVIEW_SKILL));
    // codex: non-interactive exec subcommand under a read-only sandbox.
    expect(text).toContain("codex exec");
    expect(text).toContain("--sandbox read-only");
    // gemini: headless plan (read-only) mode with workspace trust skipped.
    expect(text).toContain("gemini");
    expect(text).toContain("--approval-mode plan");
    expect(text).toContain("--skip-trust");
  });

  test("states the single-model — extra scrutiny annotation", () => {
    expect(flat(readOrEmpty(CODE_REVIEW_SKILL))).toContain("single-model — extra scrutiny");
  });

  test("describes a degraded / graceful / discarded-as-unparseable fallback", () => {
    expect(
      /degrade|graceful|discarded as unparseable/i.test(readOrEmpty(CODE_REVIEW_SKILL)),
    ).toBe(true);
  });

  test("frames corroboration as opt-out (default-on)", () => {
    expect(/opt-out/i.test(readOrEmpty(CODE_REVIEW_SKILL))).toBe(true);
  });

  test("reports providers attempted-but-skipped when unavailable", () => {
    const text = flat(readOrEmpty(CODE_REVIEW_SKILL));
    expect(/unavailable/i.test(text)).toBe(true);
    expect(/skip/i.test(text)).toBe(true);
  });
});
