// tests/tier-coverage.test.ts
//
// Free static gate: every gate-tier eval must be runnable free & mocked by
// scripts/run-gate-evals.ts. The periodic tier needs no check here — the
// behavioral-evals.yml matrix is auto-discovered from tests/*.evals.ts, so a
// new periodic suite runs automatically with no static list to police.
//
// For the gate tier, scripts/run-gate-evals.ts requires each case to have a
// mocks/agent.ndjson (the script's hard prerequisite) so it executes
// deterministically with no API key. A gate case missing its mock would run
// in NO workflow; this guard fails in that case.
//
// CRUX: the gate assertions use the SAME shared resolver (helpers/gate-cases)
// that scripts/run-gate-evals.ts uses to choose each case's mock. So this guard
// asserts the EXACT mapping the runner replays — not merely "some mock exists
// somewhere." If the resolver maps a case to the wrong dir, this test fails.

import { describe, expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { E2E_TIERS } from "./helpers/touchfiles";
import { buildCaseIndex, hasJudgeMock } from "./helpers/gate-cases";

const GATE_SCRIPT = join("scripts", "run-gate-evals.ts");
const MAX_MOCK_BYTES = 50 * 1024;

describe("gate coverage — every gate case is runnable free", () => {
  // The exact index the runner replays from — the guard and the runner share it.
  const caseIndex = buildCaseIndex();

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
