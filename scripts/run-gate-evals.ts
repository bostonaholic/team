#!/usr/bin/env bun
// scripts/run-gate-evals.ts
//
// Run every gate-tier agent eval case offline, mocked, and free — no API key,
// no `claude -p` spawn. This is the FREE PR path for the gate tier: bare
// `bun test` never loads the *.evals.ts files (they are outside Bun's
// auto-discovery pattern and gated by EVALS_TIER/diff), and the periodic
// workflow only runs EVALS_TIER=periodic, so without this script the gate-tier
// cases execute in no workflow at all.
//
// The mock seams (EVALS_MOCK_AGENT / EVALS_MOCK_JUDGE) are GLOBAL single files,
// so each case MUST run in its own `bun test` invocation with the env vars
// pointed at THAT case's mocks/ files. We therefore run one case per spawn.
//
// Runs under `bun` (NOT node) so it can import the real E2E_TIERS map and the
// shared gate-case resolver directly — no regex scraping of source text, no
// "first dir with a mock" guessing. The resolver (tests/helpers/gate-cases.ts)
// is the SAME one tests/tier-coverage.test.ts asserts against, so the guard
// and the runner cannot diverge.

import { execFileSync } from "node:child_process";

import { E2E_TIERS } from "../tests/helpers/touchfiles.ts";
import {
  buildCaseIndex,
  hasJudgeMock,
  REPO_ROOT,
  type GateCase,
} from "../tests/helpers/gate-cases.ts";
import { existsSync } from "node:fs";

interface CaseResult {
  name: string;
  ok: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// Run one case mocked. Returns { ok, reason }.
// ---------------------------------------------------------------------------

function runCase(gc: GateCase): CaseResult {
  if (!existsSync(gc.agentMock)) {
    return { name: gc.name, ok: false, reason: `missing mock: ${gc.agentMock}` };
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    EVALS_ALL: "1",
    EVALS_MOCK_AGENT: gc.agentMock,
  };
  if (hasJudgeMock(gc)) env.EVALS_MOCK_JUDGE = gc.judgeMock;
  // A bare `tests/foo.evals.ts` arg is a NAME filter to bun, not a path — it
  // must be `./`-prefixed to be treated as a file path.
  const fileArg = `./${gc.evalFile}`;
  try {
    execFileSync("bun", ["test", fileArg, "-t", gc.name], {
      cwd: REPO_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      // A mocked gate case is deterministic and fast; if it ever blocks (e.g. a
      // missing mock seam falling through to a live call), fail loud rather than
      // hang the PR job forever.
      timeout: 120_000,
    });
    return { name: gc.name, ok: true, reason: "pass" };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
    const tail = out.split("\n").slice(-6).join("\n");
    return { name: gc.name, ok: false, reason: tail || `exit ${e.status ?? "?"}` };
  }
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

function main(): void {
  const index = buildCaseIndex();

  const gateNames = Object.entries(E2E_TIERS)
    .filter(([, tier]) => tier === "gate")
    .map(([name]) => name)
    .sort();

  if (gateNames.length === 0) {
    console.error("no gate-tier cases found in E2E_TIERS");
    process.exit(1);
  }

  // Print the (caseName -> mockPath) alignment FIRST so it is auditable even
  // if a case later fails: every `-t` filter must match the case its mock dir
  // is named for.
  console.log("Gate-tier case -> mock alignment:");
  for (const name of gateNames) {
    const gc = index.get(name);
    const mockRel = gc === undefined
      ? "(no fixture case dir found)"
      : gc.agentMock.replace(`${REPO_ROOT}/`, "");
    console.log(`  ${name} -> ${mockRel}`);
  }
  console.log("");

  const results: CaseResult[] = [];
  for (const name of gateNames) {
    const gc = index.get(name);
    if (gc === undefined) {
      results.push({ name, ok: false, reason: "no fixture case dir found" });
      continue;
    }
    results.push(runCase(gc));
  }

  const passed = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log("Gate-tier eval cases (mocked, free):");
  for (const r of results) {
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
    if (!r.ok) console.log(`        ${r.reason.replace(/\n/g, "\n        ")}`);
  }
  console.log(
    `\nGate-tier eval summary: ${passed.length} passed, ${failed.length} failed (of ${results.length}).`,
  );

  process.exit(failed.length === 0 ? 0 : 1);
}

main();
