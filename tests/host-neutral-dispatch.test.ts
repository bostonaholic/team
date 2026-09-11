// tests/host-neutral-dispatch.test.ts
//
// L2 tripwire (free, deterministic): Team's pipeline privileges no host. The
// orchestrator resolves every dispatch through the portable contract in
// skills/team/references/15-host-dispatch.md, and no host-facing surface may
// claim the pipeline needs Claude Code. The negative sweep uses a named
// matcher so it can be pointed at a known positive — a clean sweep has not
// distinguished absent from blind (docs/testing.md).
//
// Defensive reads: a missing file → "" so content assertions FAIL cleanly
// rather than throwing ENOENT (the mechanical gate rejects crashes).

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

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

describe("host-neutral dispatch", () => {
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
    expect(loop).toContain("Host-neutral agent dispatch");
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
