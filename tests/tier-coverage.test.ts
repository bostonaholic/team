// tests/tier-coverage.test.ts
//
// Free static gate: no eval may belong to a tier that runs in NO workflow.
// Every test name declared in E2E_TIERS must be covered by exactly the
// workflow its tier promises:
//
//   - periodic  -> its *.evals.ts suite is a matrix file in behavioral-evals.yml
//   - gate      -> it runs free & mocked via scripts/run-gate-evals.mjs, which
//                  requires the case to have a mocks/agent.ndjson (the script's
//                  hard prerequisite) so it executes deterministically with no
//                  API key.
//
// The intent: a future eval whose tier runs in no workflow (e.g. a gate case
// with no mock, or a periodic suite missing its matrix row) fails this test.
// YAML/source scanning is dependency-free (string/regex only).

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { E2E_TIERS, E2E_TOUCHFILES } from "./helpers/touchfiles";

const WORKFLOW = ".github/workflows/behavioral-evals.yml";

// ---------------------------------------------------------------------------
// Parse the behavioral-evals matrix: `file: ./tests/<x>.evals.ts` -> <x>.
// ---------------------------------------------------------------------------

function matrixSuiteFiles(): Set<string> {
  const yaml = readFileSync(WORKFLOW, "utf8");
  const re = /file:\s*\.\/tests\/([A-Za-z0-9._-]+\.evals\.ts)/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  for (;;) {
    m = re.exec(yaml);
    if (m === null) break;
    const captured = m[1];
    if (captured !== undefined) out.add(captured);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Map a test name to the *.evals.ts suite file that registers it.
//
//   skill:<name>      -> skills.evals.ts
//   otherwise         -> the suite for the agent slug this test's touchfiles
//                        reference (e.g. planted-null-deref -> code-reviewer),
//                        falling back to the longest agent slug that prefixes
//                        the name (e.g. file-finder-finds-... -> file-finder).
// ---------------------------------------------------------------------------

function agentSlugsFromTouchfiles(): string[] {
  const slugs = new Set<string>();
  for (const patterns of Object.values(E2E_TOUCHFILES)) {
    for (const p of patterns) {
      const m = /^agents\/([A-Za-z0-9-]+)\.md$/.exec(p);
      if (m && m[1] !== undefined) slugs.add(m[1]);
    }
  }
  // Longest first so e.g. `file-finder` wins over a hypothetical `file`.
  return [...slugs].sort((a, b) => b.length - a.length);
}

// The agent slug each test's own touchfiles point at, via `agents/<slug>.md`.
function agentSlugForTest(name: string): string | null {
  const patterns = E2E_TOUCHFILES[name] ?? [];
  for (const p of patterns) {
    const m = /^agents\/([A-Za-z0-9-]+)\.md$/.exec(p);
    if (m && m[1] !== undefined) return m[1];
  }
  return null;
}

function suiteFileForTest(name: string, slugs: string[]): string | null {
  if (name.startsWith("skill:")) return "skills.evals.ts";
  const direct = agentSlugForTest(name);
  if (direct !== null) return `${direct}.evals.ts`;
  for (const slug of slugs) {
    if (name === slug || name.startsWith(`${slug}-`)) {
      return `${slug}.evals.ts`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Map a gate test name to its fixture case dir's agent.ndjson — the gate
// script's prerequisite for running the case free & mocked.
// ---------------------------------------------------------------------------

function gateAgentMockPath(name: string, slugs: string[]): string | null {
  for (const slug of slugs) {
    if (name.startsWith(`${slug}-`)) {
      const testCase = name.slice(slug.length + 1);
      return join("evals", "fixtures", slug, testCase, "mocks", "agent.ndjson");
    }
  }
  return null;
}

describe("tier coverage — no eval runs in zero workflows", () => {
  const slugs = agentSlugsFromTouchfiles();
  const matrix = matrixSuiteFiles();

  test("every periodic test's suite has a behavioral-evals.yml matrix row", () => {
    for (const [name, tier] of Object.entries(E2E_TIERS)) {
      if (tier !== "periodic") continue;
      const suite = suiteFileForTest(name, slugs);
      expect(suite, `no suite file resolved for periodic test '${name}'`).not.toBeNull();
      expect(
        matrix.has(suite as string),
        `periodic test '${name}' maps to suite '${suite}', which is NOT a matrix row in ${WORKFLOW}`,
      ).toBe(true);
    }
  });

  test("every gate test is covered by the mocked gate-evals script (has its agent mock)", () => {
    for (const [name, tier] of Object.entries(E2E_TIERS)) {
      if (tier !== "gate") continue;
      const mock = gateAgentMockPath(name, slugs);
      expect(mock, `could not resolve a fixture case dir for gate test '${name}'`).not.toBeNull();
      expect(
        existsSync(mock as string),
        `gate test '${name}' has no agent mock at '${mock}'; scripts/run-gate-evals.mjs cannot run it free & mocked, so it would execute in NO workflow`,
      ).toBe(true);
    }
  });

  test("the gate-evals script exists (the gate-tier workflow path)", () => {
    expect(existsSync(join("scripts", "run-gate-evals.mjs"))).toBe(true);
  });
});
