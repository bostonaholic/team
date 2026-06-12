// tests/helpers/gate-cases.ts
//
// Shared resolver: map a gate-tier eval test NAME to ITS OWN fixture case dir
// and mock seams. Imported by BOTH scripts/run-gate-evals.ts (the runner that
// replays each case mocked & free on every PR) and tests/tier-coverage.test.ts
// (the free static guard). They MUST agree, so the mapping lives here once.
//
// A gate test name is `<agent>-<case>`. Both the agent slug AND the case name
// can contain hyphens (e.g. `security-reviewer-safe-pattern` splits as agent
// `security-reviewer` + case `safe-pattern`). There is no safe way to split the
// hyphenated name by string surgery alone, so we resolve against the REAL
// fixture tree: for every `evals/fixtures/<agent>/<case>` dir, the canonical
// name is `<agent>-<case>`. Whichever real dir's canonical name equals the test
// name IS that case's dir. This makes a wrong-transcript mapping impossible:
// the dir is the one whose own path spells the test name.

import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repo root, derived from this file's location (tests/helpers/). */
export const REPO_ROOT = resolve(__dirname, "..", "..");

/** Where the agent fixture tree lives, relative to repo root. */
export const FIXTURES_REL = join("evals", "fixtures");

export interface GateCase {
  /** The gate test name, e.g. "security-reviewer-safe-pattern". */
  name: string;
  /** Agent slug, e.g. "security-reviewer". */
  agent: string;
  /** Case slug, e.g. "safe-pattern". */
  testCase: string;
  /** Absolute path to the fixture case dir. */
  fixtureDir: string;
  /** Absolute path to this case's agent transcript mock. */
  agentMock: string;
  /** Absolute path to this case's judge verdict mock (may not exist). */
  judgeMock: string;
  /** The *.evals.ts suite file (repo-relative) that registers this case. */
  evalFile: string;
}

/**
 * Enumerate the real fixture tree and build a name -> GateCase index.
 *
 * The `skills/` subtree is excluded: skill fixtures are nested two levels
 * deep (`fixtures/skills/<skill>/<case>`) and are a separate (periodic) suite.
 */
export function buildCaseIndex(repoRoot: string = REPO_ROOT): Map<string, GateCase> {
  const fixturesRoot = join(repoRoot, FIXTURES_REL);
  // Resolve the root once so each derived fixture dir can be checked to stay
  // inside it (containment guard below).
  const fixturesRootAbs = resolve(fixturesRoot);
  const index = new Map<string, GateCase>();
  for (const agentEnt of readdirSync(fixturesRoot, { withFileTypes: true })) {
    if (!agentEnt.isDirectory()) continue;
    const agent = agentEnt.name;
    if (agent === "skills") continue;
    const agentDir = join(fixturesRoot, agent);
    for (const caseEnt of readdirSync(agentDir, { withFileTypes: true })) {
      if (!caseEnt.isDirectory()) continue;
      const testCase = caseEnt.name;
      const fixtureDir = join(agentDir, testCase);
      // Containment guard: a derived fixture dir must resolve INSIDE
      // evals/fixtures/. Inputs are repo-controlled today, so this is
      // defense-in-depth — mirrors the path-escape check in
      // tests/implementer.evals.ts applyWriteToolCalls.
      const fixtureDirAbs = resolve(fixtureDir);
      if (!fixtureDirAbs.startsWith(fixturesRootAbs + sep)) {
        throw new Error(
          `fixture dir '${fixtureDir}' resolves outside ${fixturesRootAbs}; refusing to index it`,
        );
      }
      // Canonical-name collision guard: two distinct (agent, testCase) dirs can
      // render to the SAME `<agent>-<testCase>` key (e.g. `a-b/c` and `a/b-c`
      // both spell `a-b-c`). A silent overwrite would let the runner replay the
      // wrong dir's mock for a case, so we fail loud instead. Correctness
      // demands the name be unambiguous — there is no "longest wins" tiebreak.
      const canonical = `${agent}-${testCase}`;
      const prior = index.get(canonical);
      if (prior !== undefined) {
        throw new Error(
          `ambiguous gate-case name '${canonical}': both '${prior.agent}/${prior.testCase}' and '${agent}/${testCase}' spell it; rename one fixture dir`,
        );
      }
      index.set(canonical, {
        name: canonical,
        agent,
        testCase,
        fixtureDir,
        agentMock: join(fixtureDir, "mocks", "agent.ndjson"),
        judgeMock: join(fixtureDir, "mocks", "judge.json"),
        evalFile: join("tests", `${agent}.evals.ts`),
      });
    }
  }
  return index;
}

/**
 * Resolve a single gate test name to its case, or null if no fixture dir
 * spells that name. Deterministic: the returned dir's own path equals the
 * name, so the mock it points at is authored for exactly this case.
 */
export function resolveGateCase(
  name: string,
  repoRoot: string = REPO_ROOT,
): GateCase | null {
  return buildCaseIndex(repoRoot).get(name) ?? null;
}

/** True if this case has a judge.json mock on disk. */
export function hasJudgeMock(gc: GateCase): boolean {
  return existsSync(gc.judgeMock);
}
