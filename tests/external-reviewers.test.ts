import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";

// L1 pure-unit pins for the `.claude/team.json` config-read + availability
// probe, plus L2 static tripwires over agents/code-reviewer.md and
// skills/team-implement/SKILL.md.
//
// Each unit test dynamically imports the named export it needs, so a missing
// module surfaces as a clean per-test assertion failure rather than a
// collection-time crash of the whole file.

const REPO_ROOT = process.cwd();
const MODULE = join(REPO_ROOT, "skills", "code-review", "external-reviewers.mjs");
const CODE_REVIEWER = join(REPO_ROOT, "agents", "code-reviewer.md");
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

describe("parseTeamConfig — decided vs. undecided + normalization", () => {
  const parse = async () =>
    (await load()).parseTeamConfig as (
      obj: unknown,
    ) => { decided: boolean; reviewers: Reviewer[] };

  test("absent review key ({}) is undecided with no reviewers", async () => {
    const fn = await parse();
    expect(typeof fn).toBe("function");
    expect(fn({})).toEqual({ decided: false, reviewers: [] });
  });

  test("missing externalReviewers under review is undecided", async () => {
    const fn = await parse();
    expect(fn({ review: {} })).toEqual({ decided: false, reviewers: [] });
  });

  test("malformed / wrong-typed value reads as undecided, never throws", async () => {
    const fn = await parse();
    expect(fn({ review: { externalReviewers: "codex" } })).toEqual({
      decided: false,
      reviewers: [],
    });
    expect(fn(null)).toEqual({ decided: false, reviewers: [] });
    expect(fn("nope")).toEqual({ decided: false, reviewers: [] });
    expect(fn({ review: { externalReviewers: 7 } })).toEqual({
      decided: false,
      reviewers: [],
    });
  });

  test("present empty array [] is decided (explicit Claude-only)", async () => {
    const fn = await parse();
    expect(fn({ review: { externalReviewers: [] } })).toEqual({
      decided: true,
      reviewers: [],
    });
  });

  test("string entries normalize to {tool, model:null}", async () => {
    const fn = await parse();
    expect(fn({ review: { externalReviewers: ["codex", "gemini"] } })).toEqual({
      decided: true,
      reviewers: [
        { tool: "codex", model: null },
        { tool: "gemini", model: null },
      ],
    });
  });

  test("object entries pass model through", async () => {
    const fn = await parse();
    expect(
      fn({ review: { externalReviewers: [{ tool: "gemini", model: "gemini-3-pro" }] } }),
    ).toEqual({ decided: true, reviewers: [{ tool: "gemini", model: "gemini-3-pro" }] });
  });

  test("mixed string + object entries normalize together", async () => {
    const fn = await parse();
    expect(
      fn({
        review: { externalReviewers: ["codex", { tool: "gemini", model: "gemini-3-pro" }] },
      }),
    ).toEqual({
      decided: true,
      reviewers: [
        { tool: "codex", model: null },
        { tool: "gemini", model: "gemini-3-pro" },
      ],
    });
  });

  test("lowercases, trims, dedupes by tool (first wins), filters to KNOWN_PROVIDERS", async () => {
    const fn = await parse();
    expect(
      fn({
        review: {
          externalReviewers: [
            " Codex ",
            "bogus",
            { tool: "CODEX", model: "ignored-dupe" },
            "gemini",
          ],
        },
      }),
    ).toEqual({
      decided: true,
      reviewers: [
        { tool: "codex", model: null },
        { tool: "gemini", model: null },
      ],
    });
  });

  test("blank/non-string model collapses to null", async () => {
    const fn = await parse();
    expect(
      fn({ review: { externalReviewers: [{ tool: "codex", model: "  " }] } }),
    ).toEqual({ decided: true, reviewers: [{ tool: "codex", model: null }] });
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

describe("availableReviewers — install-gates a parsed reviewer list, keeps model", () => {
  const avail = async () =>
    (await load()).availableReviewers as (
      reviewers: Reviewer[],
      deps: ProbeDeps,
    ) => Promise<Reviewer[]>;

  test("returns only the named-and-available subset, preserving model", async () => {
    const fn = await avail();
    expect(typeof fn).toBe("function");
    const out = await fn(
      [
        { tool: "codex", model: null },
        { tool: "gemini", model: "gemini-3-pro" },
      ],
      {
        which: async (n: string) => (n === "codex" ? "/usr/local/bin/codex" : null),
        version: async (_n: string) => 0,
      },
    );
    expect(out).toEqual([{ tool: "codex", model: null }]);
  });

  test("passes a configured model through to the available entry", async () => {
    const fn = await avail();
    const out = await fn([{ tool: "gemini", model: "gemini-3-pro" }], {
      which: async (_n: string) => "/usr/local/bin/x",
      version: async (_n: string) => 0,
    });
    expect(out).toEqual([{ tool: "gemini", model: "gemini-3-pro" }]);
  });

  test("empty reviewer list yields no reviewers (today's behavior)", async () => {
    const fn = await avail();
    const out = await fn([], {
      which: async (_n: string) => "/usr/local/bin/x",
      version: async (_n: string) => 0,
    });
    expect(out).toEqual([]);
  });
});

describe("detectCandidates — installed KNOWN_PROVIDERS, ignoring config", () => {
  const detect = async () =>
    (await load()).detectCandidates as (deps: ProbeDeps) => Promise<string[]>;

  test("reports every installed known provider regardless of config", async () => {
    const fn = await detect();
    expect(typeof fn).toBe("function");
    const out = await fn({
      which: async (_n: string) => "/usr/local/bin/x",
      version: async (_n: string) => 0,
    });
    expect(out).toEqual(["codex", "gemini"]);
  });

  test("omits a provider whose binary is missing", async () => {
    const fn = await detect();
    const out = await fn({
      which: async (n: string) => (n === "gemini" ? "/usr/local/bin/gemini" : null),
      version: async (_n: string) => 0,
    });
    expect(out).toEqual(["gemini"]);
  });

  test("empty when nothing is installed", async () => {
    const fn = await detect();
    const out = await fn({
      which: async (_n: string) => null,
      version: async (_n: string) => 0,
    });
    expect(out).toEqual([]);
  });
});

describe("mergeDecision — pure write-shape, preserves other keys", () => {
  const merge = async () =>
    (await load()).mergeDecision as (
      existing: unknown,
      reviewers: unknown[],
    ) => Record<string, unknown>;

  test("sets review.externalReviewers on an empty/missing config", async () => {
    const fn = await merge();
    expect(typeof fn).toBe("function");
    expect(fn({}, ["codex"])).toEqual({ review: { externalReviewers: ["codex"] } });
    expect(fn(null, [])).toEqual({ review: { externalReviewers: [] } });
  });

  test("preserves other top-level keys and other review.* keys", async () => {
    const fn = await merge();
    const existing = {
      someOtherTool: { enabled: true },
      review: { foo: "bar", externalReviewers: ["gemini"] },
    };
    expect(fn(existing, ["codex", "gemini"])).toEqual({
      someOtherTool: { enabled: true },
      review: { foo: "bar", externalReviewers: ["codex", "gemini"] },
    });
  });

  test("records [] for the explicit Claude-only decision", async () => {
    const fn = await merge();
    expect(fn({ review: { externalReviewers: ["codex"] } }, [])).toEqual({
      review: { externalReviewers: [] },
    });
  });
});

describe("external-reviewers.mjs CLI contract (L2)", () => {
  test("the deterministic probe module ships beside the code-review skill", () => {
    expect(existsSync(MODULE)).toBe(true);
  });

  test("doc comment names .claude/team.json and the JSON {tool,model} stdout shape", () => {
    const text = readOrEmpty(MODULE);
    expect(text).toContain(".claude/team.json");
    expect(/stdout/i.test(text)).toBe(true);
    expect(/JSON array of .*tool.*model|\{tool,model\}/i.test(text)).toBe(true);
  });

  test("doc comment documents the --candidates and --set CLI modes", () => {
    const text = readOrEmpty(MODULE);
    expect(text).toContain("--candidates");
    expect(text).toContain("--set");
  });

  test("does NOT read the plugin manifest for config", () => {
    expect(readOrEmpty(MODULE)).not.toContain(".claude-plugin/plugin.json");
  });
});

// ---------------------------------------------------------------------------
// L2 static tripwire over agents/code-reviewer.md.
// String-presence only; the edge cases are pinned by the unit suites above.
// ---------------------------------------------------------------------------
describe("code-reviewer.md wires in external-reviewer corroboration (L2 tripwire)", () => {
  test("names the .claude/team.json config file", () => {
    expect(flat(readOrEmpty(CODE_REVIEWER))).toContain(".claude/team.json");
  });

  test("documents the per-run override from the orchestrator", () => {
    expect(/per-run|override/i.test(readOrEmpty(CODE_REVIEWER))).toBe(true);
  });

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
    expect(/degrade|graceful|discarded as unparseable/i.test(readOrEmpty(CODE_REVIEWER))).toBe(
      true,
    );
  });

  test("still references code-review/SKILL.md (preserves the existing cross-reference)", () => {
    expect(readOrEmpty(CODE_REVIEWER)).toContain("code-review/SKILL.md");
  });

  test("no longer points users at a plugin.json config field", () => {
    expect(readOrEmpty(CODE_REVIEWER)).not.toContain(".claude-plugin/plugin.json");
  });
});

// ---------------------------------------------------------------------------
// L2 static tripwire over skills/team-implement/SKILL.md — the orchestrator's
// detect-and-prompt on-ramp at the review fan-out.
// ---------------------------------------------------------------------------
describe("team-implement/SKILL.md describes the detect-and-prompt on-ramp (L2 tripwire)", () => {
  test("names the .claude/team.json config file", () => {
    expect(flat(readOrEmpty(TEAM_IMPLEMENT))).toContain(".claude/team.json");
  });

  test("references the external-reviewers probe with --candidates and --set", () => {
    const text = flat(readOrEmpty(TEAM_IMPLEMENT));
    expect(text).toContain("external-reviewers.mjs");
    expect(text).toContain("--candidates");
    expect(text).toContain("--set");
  });

  test("uses AskUserQuestion to prompt for detected providers", () => {
    expect(flat(readOrEmpty(TEAM_IMPLEMENT))).toContain("AskUserQuestion");
  });

  test("states the precedence chain (per-run override ▸ file ▸ prompt ▸ off)", () => {
    expect(/per-run|override/i.test(readOrEmpty(TEAM_IMPLEMENT))).toBe(true);
    expect(/precedence/i.test(readOrEmpty(TEAM_IMPLEMENT))).toBe(true);
  });

  test("only prompts when no decision is recorded (undecided), never re-prompts", () => {
    expect(/decision|undecided|re-prompt|never.*prompt/i.test(readOrEmpty(TEAM_IMPLEMENT))).toBe(
      true,
    );
  });
});
