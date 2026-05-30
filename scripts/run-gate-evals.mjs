#!/usr/bin/env node
// scripts/run-gate-evals.mjs
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
// Source of truth for "which cases are gate tier" is E2E_TIERS in
// tests/helpers/touchfiles.ts, parsed here without any dependency.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Parse E2E_TIERS from touchfiles.ts (dependency-free; string/regex only).
// Returns Map<testName, "gate" | "periodic">.
// ---------------------------------------------------------------------------

function parseTiers() {
  const src = readFileSync(
    join(repoRoot, "tests", "helpers", "touchfiles.ts"),
    "utf8",
  );
  const open = src.indexOf("E2E_TIERS");
  if (open < 0) throw new Error("E2E_TIERS not found in touchfiles.ts");
  const braceStart = src.indexOf("{", open);
  const braceEnd = src.indexOf("};", braceStart);
  if (braceStart < 0 || braceEnd < 0) {
    throw new Error("could not bound the E2E_TIERS object literal");
  }
  const body = src.slice(braceStart + 1, braceEnd);
  const tiers = new Map();
  const entry = /"([^"]+)"\s*:\s*"(gate|periodic)"/g;
  let m;
  while ((m = entry.exec(body)) !== null) {
    tiers.set(m[1], m[2]);
  }
  return tiers;
}

// ---------------------------------------------------------------------------
// Map a gate test name to its eval file and fixture case dir.
//
// A test name is `<agent>-<case>` where the agent slug may itself contain
// hyphens (e.g. file-finder-finds-planted-files). We resolve it against the
// real fixture tree: for each `evals/fixtures/<agent>/<case>`, the candidate
// name is `<agent>-<case>`. The eval file is `tests/<agent>.evals.ts`.
// ---------------------------------------------------------------------------

function buildCaseIndex() {
  const fixturesRoot = join(repoRoot, "evals", "fixtures");
  const index = new Map(); // testName -> { agent, testCase, fixtureDir, evalFile }
  for (const agentEnt of readdirSync(fixturesRoot, { withFileTypes: true })) {
    if (!agentEnt.isDirectory()) continue;
    const agent = agentEnt.name;
    if (agent === "skills") continue; // skills are a separate (periodic) suite
    const agentDir = join(fixturesRoot, agent);
    for (const caseEnt of readdirSync(agentDir, { withFileTypes: true })) {
      if (!caseEnt.isDirectory()) continue;
      const testCase = caseEnt.name;
      index.set(`${agent}-${testCase}`, {
        agent,
        testCase,
        fixtureDir: join(agentDir, testCase),
        evalFile: join("tests", `${agent}.evals.ts`),
      });
    }
  }
  return index;
}

// ---------------------------------------------------------------------------
// Run one case mocked. Returns { ok, reason }.
// ---------------------------------------------------------------------------

function runCase(name, info) {
  const agentMock = join(info.fixtureDir, "mocks", "agent.ndjson");
  const judgeMock = join(info.fixtureDir, "mocks", "judge.json");
  if (!existsSync(agentMock)) {
    return { ok: false, reason: `missing mock: ${agentMock}` };
  }
  const env = {
    ...process.env,
    EVALS_ALL: "1",
    EVALS_MOCK_AGENT: agentMock,
  };
  if (existsSync(judgeMock)) env.EVALS_MOCK_JUDGE = judgeMock;
  // A bare `tests/foo.evals.ts` arg is a NAME filter to bun, not a path — it
  // must be `./`-prefixed to be treated as a file path.
  const fileArg = `./${info.evalFile}`;
  try {
    execFileSync("bun", ["test", fileArg, "-t", name], {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    return { ok: true, reason: "pass" };
  } catch (err) {
    const out = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
    const tail = out.split("\n").slice(-6).join("\n");
    return { ok: false, reason: tail || `exit ${err.status ?? "?"}` };
  }
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

function main() {
  const tiers = parseTiers();
  const index = buildCaseIndex();

  const gateNames = [...tiers.entries()]
    .filter(([, tier]) => tier === "gate")
    .map(([name]) => name)
    .sort();

  if (gateNames.length === 0) {
    console.error("no gate-tier cases found in E2E_TIERS");
    process.exit(1);
  }

  const results = [];
  for (const name of gateNames) {
    const info = index.get(name);
    if (info === undefined) {
      results.push({ name, ok: false, reason: "no fixture case dir found" });
      continue;
    }
    const r = runCase(name, info);
    results.push({ name, ok: r.ok, reason: r.reason });
  }

  const passed = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log("Gate-tier eval cases (mocked, free):");
  for (const r of results) {
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
    if (!r.ok) console.log(`        ${r.reason.replace(/\n/g, "\n        ")}`);
  }
  console.log(`\n${passed.length}/${results.length} gate-tier cases passed.`);

  process.exit(failed.length === 0 ? 0 : 1);
}

main();
