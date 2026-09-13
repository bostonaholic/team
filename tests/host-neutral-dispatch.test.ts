// tests/host-neutral-dispatch.test.ts
//
// L2 tripwire (free, deterministic): the orchestrator resolves every dispatch
// through the portable contract in skills/team/references/15-host-dispatch.md,
// and no host-facing surface may claim the pipeline needs Claude Code. The
// negative sweep uses a named matcher so it can be pointed at a known positive
// — a clean sweep has not distinguished absent from blind (docs/testing.md).
//
// Defensive reads: a missing file → "" so content assertions FAIL cleanly
// rather than throwing ENOENT (the mechanical gate rejects crashes).

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { loadInstructionContext } from "./helpers/fixtures";

import { read, squash } from "./helpers/text";

const REPO_ROOT = process.cwd();
const DISPATCH = join(REPO_ROOT, "skills", "team", "references", "15-host-dispatch.md");
const TEAM_SKILL = join(REPO_ROOT, "skills", "team", "SKILL.md");
const PHASE_LOOP = join(REPO_ROOT, "skills", "team", "references", "03-the-phase-loop.md");

// The banned claim, as a matcher the positive-control test can fire.
const CLAUDE_ONLY =
  /full pipeline needs Claude Code|host that dispatches the agents|cannot dispatch Claude Code agents/i;

// Every surface a user or developer reads to learn what the pipeline needs.
const HOST_FACING = [
  "README.md",
  "AGENTS.md",
  "docs/index.md",
  "docs/architecture.md",
  "docs/cross-host-portability.md",
  ".codex-plugin/plugin.json",
  "plugin.json",
];

function readIf(path: string): string {
  return existsSync(path) ? read(path) : "";
}

describe("Installed resource delivery: dispatch callers", () => {
  const copies: string[] = [];
  afterEach(() => { for (const path of copies.splice(0)) rmSync(path, { recursive: true, force: true }); });

  function installedDispatchLinks(caller: string, operation: string) {
    const root = mkdtempSync(join(tmpdir(), "team-dispatch-callers-"));
    copies.push(root);
    cpSync(join(REPO_ROOT, "skills"), join(root, "skills"), { recursive: true });
    const base = dirname(join(root, caller));
    const body = readIf(join(root, caller)) + "\n" + readIf(join(base, operation));
    const targets = [...body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
      .map((match) => resolve(base, (match[1] ?? "").split("#")[0] ?? ""));
    return { root, targets, contract: join(root, "skills/team/references/15-host-dispatch.md") };
  }

  test("team-design resolves the shared installed dispatch contract (positive control)", () => {
    const installed = installedDispatchLinks("skills/team-design/SKILL.md", "SKILL.md");

    expect(installed.targets).toContain(installed.contract);
    expect(loadInstructionContext(["skills/team/references/15-host-dispatch.md"], installed.root))
      .toContain(readIf(DISPATCH));
  });

  test.each([
    { caller: "skills/code-review/SKILL.md", operation: "SKILL.md" },
    { caller: "skills/pr-verify/SKILL.md", operation: "references/04-execution.md" },
    { caller: "skills/team/references/agent-dispatch.md", operation: "15-host-dispatch.md" },
  ])("$caller resolves its shared installed dispatch contract", ({ caller, operation }) => {
    const installed = installedDispatchLinks(caller, operation);

    expect(installed.targets, caller).toContain(installed.contract);
    expect(() => loadInstructionContext(["skills/team/references/15-host-dispatch.md"], installed.root)).not.toThrow();
  });
});

describe("Installed resource delivery: explicit links", () => {
  const copies: string[] = [];
  afterEach(() => { for (const path of copies.splice(0)) rmSync(path, { recursive: true, force: true }); });

  function installedCopy() {
    const root = mkdtempSync(join(tmpdir(), "team-contract-links-"));
    copies.push(root);
    cpSync(join(REPO_ROOT, "skills"), join(root, "skills"), { recursive: true });
    return root;
  }

  function linkTargets(file: string) {
    return [...readIf(file).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
      .map((match) => resolve(dirname(file), (match[1] ?? "").split("#")[0] ?? ""));
  }

  test.each([
    ["skills/team-design/SKILL.md", "skills/team/references/artifacts.md"],
  ])("%s resolves its cross-skill link to %s within the installed copy", (caller, target) => {
    const root = installedCopy();
    const targets = linkTargets(join(root, caller!));
    expect(targets).toContain(join(root, target!));
    expect(() => loadInstructionContext([target!], root)).not.toThrow();
  });

  test("the installed artifact contract resolves its conditional template beside the contract or under team templates", () => {
    const root = installedCopy();
    const artifact = join(root, "skills/team/references/artifacts.md");
    expect(existsSync(artifact), artifact).toBe(true);
    const targets = linkTargets(artifact).filter((path) => path.endsWith("/conditional-artifacts.md"));
    expect(targets).toHaveLength(1);
    expect([
      join(root, "skills/team/references/conditional-artifacts.md"),
      join(root, "skills/team/templates/conditional-artifacts.md"),
    ]).toContain(targets[0]!);
    expect(existsSync(targets[0]!)).toBe(true);
    expect(readIf(targets[0]!)).toContain("phase: repos");
    expect(readIf(targets[0]!)).toContain("phase: prd");
  });
});

describe("agent dispatch", () => {
  test("the portable dispatch contract exists and states the resolution order", () => {
    const body = squash(readIf(DISPATCH));
    // Guard: a missing contract must fail, not vacuously pass.
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain("agents/<name>.md");
    expect(body).toContain("Named agent");
    expect(body).toContain("Body-load subagent");
    expect(body).toContain("Inline fallback");
  });

  test("the orchestrator loads the contract", () => {
    const skill = readIf(TEAM_SKILL);
    expect(skill.length).toBeGreaterThan(0);
    expect(skill).toContain("references/15-host-dispatch.md");
  });

  test("the phase loop resolves dispatch through the contract", () => {
    const loop = readIf(PHASE_LOOP);
    expect(loop.length).toBeGreaterThan(0);
    expect(loop).toContain("dispatch contract");
    expect(loop).toContain("references/15-host-dispatch.md");
  });

  test("no host-facing surface claims the pipeline needs Claude Code", () => {
    for (const rel of HOST_FACING) {
      const text = readIf(join(REPO_ROOT, rel));
      // Guard: a missing surface must fail, not vacuously pass the absence check.
      expect(text.length).toBeGreaterThan(0);
      expect(CLAUDE_ONLY.test(text)).toBe(false);
    }
  });

  test("the banned-claim matcher can see a positive", () => {
    const sample =
      "The full pipeline needs Claude Code, because that is the host that dispatches the agents.";
    expect(CLAUDE_ONLY.test(sample)).toBe(true);
  });
});
