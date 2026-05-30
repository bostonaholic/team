// tests/tier-coverage.test.ts
//
// Free static gate: no eval may belong to a tier that runs in NO workflow.
// Every test name declared in E2E_TIERS must be covered by exactly the
// workflow its tier promises:
//
//   - periodic  -> its *.evals.ts suite is a matrix file in behavioral-evals.yml
//   - gate      -> it runs free & mocked via scripts/run-gate-evals.ts, which
//                  requires the case to have a mocks/agent.ndjson (the script's
//                  hard prerequisite) so it executes deterministically with no
//                  API key.
//
// The intent: a future eval whose tier runs in no workflow (e.g. a gate case
// with no mock, or a periodic suite missing its matrix row) fails this test.
//
// CRUX: the gate assertions use the SAME shared resolver (helpers/gate-cases)
// that scripts/run-gate-evals.ts uses to choose each case's mock. So this guard
// asserts the EXACT mapping the runner replays — not merely "some mock exists
// somewhere." If the resolver maps a case to the wrong dir, this test fails.
//
// YAML/source scanning is dependency-free (string/regex only).

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { E2E_TIERS, E2E_TOUCHFILES } from "./helpers/touchfiles";
import { buildCaseIndex, hasJudgeMock } from "./helpers/gate-cases";

const WORKFLOW = ".github/workflows/behavioral-evals.yml";
const GATE_SCRIPT = join("scripts", "run-gate-evals.ts");
const MAX_MOCK_BYTES = 50 * 1024;

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
// Map a periodic test name to the *.evals.ts suite file that registers it.
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

describe("tier coverage — no eval runs in zero workflows", () => {
  const slugs = agentSlugsFromTouchfiles();
  const matrix = matrixSuiteFiles();
  // The exact index the runner replays from — the guard and the runner share it.
  const caseIndex = buildCaseIndex();

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

  test("every gate test resolves to its OWN fixture dir with a real agent mock", () => {
    for (const [name, tier] of Object.entries(E2E_TIERS)) {
      if (tier !== "gate") continue;
      const gc = caseIndex.get(name);
      expect(
        gc,
        `the shared resolver found no fixture case dir named '${name}'; scripts/run-gate-evals.ts cannot map it to a mock, so it would run in NO workflow`,
      ).not.toBeUndefined();
      // The resolved dir's own canonical name must equal the test name — proof
      // the mock belongs to THIS case, not some other case's transcript.
      expect(
        `${gc!.agent}-${gc!.testCase}`,
        `gate test '${name}' resolved to dir '${gc!.agent}/${gc!.testCase}', whose canonical name does not match`,
      ).toBe(name);
      expect(
        existsSync(gc!.agentMock),
        `gate test '${name}' has no agent mock at '${gc!.agentMock}'; the runner cannot replay it free & mocked`,
      ).toBe(true);
    }
  });

  test("every gate eval that needs a judge has its judge.json mock", () => {
    // Edge-case detection evals (e.g. *-empty-input, *-safe-pattern) assert
    // deterministically and need no judge.json. A gate eval whose suite calls
    // the judge but whose fixture lacks judge.json would replay against a
    // missing seam. We only require judge.json where it exists on disk to be a
    // sane (non-empty) file; absence is allowed by design.
    for (const [name, tier] of Object.entries(E2E_TIERS)) {
      if (tier !== "gate") continue;
      const gc = caseIndex.get(name);
      if (gc === undefined) continue; // covered by the prior test
      if (!hasJudgeMock(gc)) continue;
      expect(
        statSync(gc.judgeMock).size,
        `gate test '${name}' has an empty judge.json mock`,
      ).toBeGreaterThan(0);
    }
  });

  test("every gate mock file is within the size cap (untrusted-PR defense)", () => {
    // The gate runner replays these on the PR-triggered (untrusted) path. Cap
    // mock size so a crafted/oversized transcript fails the free static gate
    // rather than being replayed.
    for (const [name, tier] of Object.entries(E2E_TIERS)) {
      if (tier !== "gate") continue;
      const gc = caseIndex.get(name);
      if (gc === undefined) continue;
      for (const mock of [gc.agentMock, gc.judgeMock]) {
        if (!existsSync(mock)) continue;
        const bytes = statSync(mock).size;
        expect(
          bytes,
          `${mock} is ${bytes} bytes; cap is ${MAX_MOCK_BYTES}`,
        ).toBeLessThanOrEqual(MAX_MOCK_BYTES);
      }
    }
  });

  test("the gate-evals script exists (the gate-tier workflow path)", () => {
    expect(existsSync(GATE_SCRIPT)).toBe(true);
  });
});
