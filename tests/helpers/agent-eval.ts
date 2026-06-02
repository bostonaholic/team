// tests/helpers/agent-eval.ts
//
// defineAgentEval — shared scaffolding for the standard agent eval files.
//
// The ~10 standard agent eval files (file-finder, verifier, test-architect,
// security-reviewer, design-author, planner, questioner, researcher,
// structure-planner, technical-writer) were ~95% identical: one EvalCollector
// per file, a tmp workdir per case, a `runAgentTest` spawn, a `collector.addTest`
// call with the same shape, and an `afterAll` that finalizes + asserts no budget
// regressions. The only real per-case variation is:
//   - the fixture (agent + case),
//   - the prompt prefix,
//   - whether a judgeQuality call is made (detection-rate vs judgment mode),
//   - the pass predicate and the run-time `expect()` assertions.
//
// This module owns the invariant scaffolding and lets each file express its
// cases as configuration. The pass predicate and assertions stay per-case via a
// `check` callback, so NO assertion changes: every current `passed` semantic and
// every `expect()` is reproduced exactly by the converted files.
//
// Mock seams (offline, no key, no cost) are inherited from session-runner /
// llm-judge unchanged:
//   EVALS_MOCK_AGENT=<path>   replay a recorded NDJSON transcript
//   EVALS_MOCK_JUDGE=<path>   replay a recorded judge verdict JSON

import { afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  EvalCollector,
  assertNoBudgetRegressions,
  type EvalTestEntry,
} from "./eval-store.ts";
import { loadFixture, type Fixture } from "./fixtures.ts";
import {
  judgeQuality,
  outcomeJudge,
  type OutcomeScore,
  type QualityScore,
} from "./llm-judge.ts";
import { runAgentTest, type SkillTestResult } from "./session-runner.ts";
import { testIfSelected } from "./touchfiles.ts";

const DEFAULT_CASE_TIMEOUT_MS = 240_000;
const DEFAULT_RUN_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_TURNS = 6;

/** The scores a `score` callback returns to be logged under `judge_scores`. */
export type JudgeScores = Record<string, number>;

/** Context handed to a detection-rate case's `score` / `assert` callbacks. */
export interface DetectionContext {
  result: SkillTestResult;
  outcome: OutcomeScore;
  fixture: Fixture;
}

/** Context handed to a judgment case's `score` / `assert` callbacks. */
export interface JudgmentContext {
  result: SkillTestResult;
  outcome: OutcomeScore;
  quality: QualityScore;
  fixture: Fixture;
}

/** What a `score` callback returns: the pass verdict plus the scores to log. */
export interface CaseScore {
  passed: boolean;
  judgeScores: JudgeScores;
}

interface CaseBase {
  /** The testIfSelected case name, e.g. "file-finder-finds-planted-files". */
  name: string;
  /** Fixture case slug under evals/fixtures/<agent>/<case>/. */
  fixtureCase: string;
  /** Prefix for the tmp workdir name (defaults to `${name}-`). */
  workdirPrefix?: string;
  /**
   * Per-case prompt prefix override. Defaults to the shared `options.prompt`.
   * Used when one case in a file needs different framing (e.g. verifier's
   * "name EVERY violation" no-op guard).
   */
  prompt?: string;
}

export interface DetectionCase extends CaseBase {
  mode: "detection-rate";
  /**
   * Compute the pass verdict and the scores to log. Pure: NO `expect()` here —
   * the entry is recorded with this verdict BEFORE assertions run, matching
   * the original files (a recorded result even when an assertion later throws).
   */
  score: (ctx: DetectionContext) => CaseScore;
  /** Run the run-time `expect()` assertions. Mirrors the original tail. */
  assert: (ctx: DetectionContext) => void;
}

export interface JudgmentCase extends CaseBase {
  mode: "judgment";
  /**
   * Compute the pass verdict and the scores to log. Pure: NO `expect()` here —
   * the entry is recorded with this verdict BEFORE assertions run, matching
   * the original files.
   */
  score: (ctx: JudgmentContext) => CaseScore;
  /** Run the run-time `expect()` assertions. Mirrors the original tail. */
  assert: (ctx: JudgmentContext) => void;
}

export type AgentEvalCase = DetectionCase | JudgmentCase;

export interface DefineAgentEvalOptions {
  /** Agent slug, e.g. "file-finder". Used for fixture loading + suite name. */
  agent: string;
  /** Shared prompt prefix prepended to each fixture body. */
  prompt: string;
  /** The cases to register against a single shared collector. */
  cases: AgentEvalCase[];
  /** Per-case timeout passed to testIfSelected (defaults to 240s). */
  caseTimeoutMs?: number;
  /** Per-run timeout passed to runAgentTest (defaults to 180s). */
  runTimeoutMs?: number;
  /** Max conversation turns per case (defaults to 6). */
  maxTurns?: number;
  /**
   * Build the per-case working directory. Defaults to a fresh tmp dir. The
   * researcher overrides this to `git init` a throwaway repo.
   */
  makeWorkdir?: (prefix: string) => string;
}

function defaultMakeWorkdir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Register a standard agent eval file's cases against one shared collector and
 * a single `afterAll` that finalizes + asserts no budget regressions. The
 * caller passes the agent slug, a shared prompt prefix, and per-case config;
 * the factory owns all the invariant scaffolding.
 */
export function defineAgentEval(options: DefineAgentEvalOptions): void {
  const suite = `${options.agent}-e2e`;
  const caseTimeout = options.caseTimeoutMs ?? DEFAULT_CASE_TIMEOUT_MS;
  const runTimeout = options.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const makeWorkdir = options.makeWorkdir ?? defaultMakeWorkdir;

  const collector = new EvalCollector("e2e");

  for (const evalCase of options.cases) {
    testIfSelected(
      evalCase.name,
      async () => {
        const fixture = loadFixture(options.agent, evalCase.fixtureCase);
        const prefix = evalCase.workdirPrefix ?? `${evalCase.name}-`;
        const workDir = makeWorkdir(prefix);

        try {
          const result = await runAgentTest({
            prompt: (evalCase.prompt ?? options.prompt) + fixture.body,
            workingDirectory: workDir,
            maxTurns,
            timeout: runTimeout,
            testName: evalCase.name,
          });

          const outcome = outcomeJudge(fixture.groundTruth, result.output);

          // Order matters: compute the verdict, record it, THEN assert — so a
          // later assertion failure still leaves a recorded result, exactly as
          // the original hand-written files did.
          let scored: CaseScore;
          let runAssert: () => void;
          if (evalCase.mode === "judgment") {
            const quality = await judgeQuality(result.output);
            const ctx: JudgmentContext = { result, outcome, quality, fixture };
            scored = evalCase.score(ctx);
            runAssert = () => evalCase.assert(ctx);
          } else {
            const ctx: DetectionContext = { result, outcome, fixture };
            scored = evalCase.score(ctx);
            runAssert = () => evalCase.assert(ctx);
          }

          const entry: EvalTestEntry = {
            name: evalCase.name,
            suite,
            tier: "e2e",
            passed: scored.passed,
            duration_ms: result.duration,
            cost_usd: result.costEstimate.estimatedCost,
            transcript: result.transcript,
            judge_scores: scored.judgeScores,
            exit_reason: result.exitReason,
            model: result.model,
            first_response_ms: result.firstResponseMs,
            max_inter_turn_ms: result.maxInterTurnMs,
          };
          collector.addTest(entry);

          runAssert();
        } finally {
          rmSync(workDir, { recursive: true, force: true });
        }
      },
      caseTimeout,
    );
  }

  afterAll(async () => {
    await collector.finalize();
    assertNoBudgetRegressions(collector);
  });
}
