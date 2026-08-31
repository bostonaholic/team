// tests/code-reviewer-replay.test.ts
//
// L3 subprocess replay per docs/testing.md: spawn the program, capture
// stdout / files written / exit code. L1–L4 run in the free suite, so
// this runs on every PR for every author, including forks. Each scenario
// spawns `bun test ./tests/code-reviewer.evals.ts` against a committed
// NDJSON transcript, exercising the scoring composition in that file —
// BLOCKING_LABEL, FINDING_LABEL, splitIntoFindingSegments,
// blockingLabelOnHint, countFalsePositives, and the pass predicate — which
// no other free test executes.
//
// Key-free: the child env is built explicitly (never spread from
// process.env) with both API key vars pinned to "". The empty strings are
// load-bearing — bun auto-loads a `.env` from the child's cwd and fills
// only UNSET vars, so an omitted key would be silently supplied by a
// repo-root `.env` while an explicit "" blocks it. Two guards backstop a
// broken mock seam before any metered call:
//   - agent seam: the live-path guard in tests/helpers/session-runner.ts
//     throws "refusing live spawn" when EVALS_MOCK_AGENT is unset and no
//     key exists;
//   - judge seam: getClient in tests/helpers/llm-judge.ts throws
//     "EVALS_ANTHROPIC_API_KEY is required for the LLM-judge tier".
//
// Child-env notes:
//   - EVALS_TIER stays unset: filterByTier passes everything through when
//     EVALS_TIER is unset; EVALS_TIER=gate would deselect the periodic
//     fixture and register test.skip — a false green.
//   - EVALS_FAKE_CHANGED_FILES pins selection to exactly one eval through the
//     fake-diff override in getChangedFiles; the mock seams stay
//     process-global.
//   - EVALS_RESULTS_ROOT points at a per-run temp dir so the child never
//     writes evals/results/. Budget regression cannot fire: the fresh root
//     has no prior run, and replayed tool/turn counts sit under the
//     minPriorTools/minPriorTurns floors in findBudgetRegressions.
//
// False-green guard: zero selection makes testIfSelected register
// test.skip and ALSO exit 0, so no scenario asserts exit code alone. With an
// explicit ./-prefixed path argument, piped (non-TTY) bun 1.3.14 prints a
// per-test result line for every test — "(pass) <name>" / "(fail) <name>"
// / "(skip) <name>" — so each scenario pins the marker + case name, which
// a "(skip)" line can never satisfy. (The ./ prefix is load-bearing: a
// bare "tests/code-reviewer.evals.ts" argument is a name FILTER, matches
// no test file, and exits non-zero without running anything.)

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const TRANSCRIPT_DIR = join(import.meta.dir, "fixtures", "code-reviewer-replay");
const JUDGE_VERDICT = join(TRANSCRIPT_DIR, "judge-verdict.json");

// Bounds the child wait; bun's 5s default per-test timeout would kill the
// parent before a slow child returns.
const SCENARIO_TIMEOUT_MS = 90_000;

function runReplay(transcriptPath: string): {
  status: number | null;
  output: string;
} {
  const resultsRoot = mkdtempSync(
    join(tmpdir(), `code-reviewer-replay-${process.pid}-`),
  );
  try {
    // process.execPath is the running bun binary — no PATH lookup for the
    // test runner itself. PATH/HOME pass through for the child's git calls
    // (detectBaseBranch, eval-store finalize).
    const child = spawnSync(
      process.execPath,
      ["test", "./tests/code-reviewer.evals.ts"],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 60_000,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          // Explicit "" so a repo-root .env cannot fill these in the child
          // (bun's .env autoload fills only unset vars).
          ANTHROPIC_API_KEY: "",
          EVALS_ANTHROPIC_API_KEY: "",
          EVALS_MOCK_AGENT: transcriptPath,
          EVALS_MOCK_JUDGE: JUDGE_VERDICT,
          EVALS_FAKE_CHANGED_FILES:
            "evals/fixtures/code-reviewer/planted-comment-violations/input.md",
          EVALS_RESULTS_ROOT: resultsRoot,
        },
      },
    );
    return {
      status: child.status,
      output: `${child.stdout ?? ""}${child.stderr ?? ""}`,
    };
  } finally {
    rmSync(resultsRoot, { recursive: true, force: true });
  }
}

describe("code-reviewer scoring pipeline offline replay", () => {
  test(
    "replays the green transcript through the full scoring pipeline key-free",
    () => {
      const result = runReplay(join(TRANSCRIPT_DIR, "green.ndjson"));

      // The eval RAN and passed — a zero-selection run would print
      // "(skip) planted-comment-violations" instead and still exit 0.
      expect(result.output).toContain("(pass) planted-comment-violations");
      expect(result.status).toBe(0);
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "regression: a line-cited review that never quotes the plants still scores detected",
    () => {
      // Real transcript from periodic run 33364482304: the reviewer found
      // all three plants and exempted both decoys, but cited each finding
      // as `file: src/webhooks/retry.js:<line>` with a description instead
      // of quoting the planted comment text — the citation style
      // skills/conventional-comments/SKILL.md mandates. Detection hints
      // that only match verbatim quotes scored it 1/3.
      const result = runReplay(
        join(TRANSCRIPT_DIR, "regression-line-cited-review.ndjson"),
      );

      expect(result.output).toContain("(pass) planted-comment-violations");
      expect(result.status).toBe(0);
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "reddens on a transcript whose blocking label rides the wrong finding",
    () => {
      const result = runReplay(
        join(TRANSCRIPT_DIR, "red-blocking-label-elsewhere.ndjson"),
      );

      // Red for the RIGHT reason: the transcript detects all three plants
      // (passing the detection assertions) but parks `issue (blocking):`
      // on the b2 finding, so the child must fail at exactly the
      // blocking-label-placement expect in registerPlantedBugEval — bun's
      // code frame for that failing expect names blockingLabelOnHint.
      // An unrelated crash, a key-guard throw, or a zero-selection skip
      // cannot satisfy all three assertions.
      expect(result.output).toContain("(fail) planted-comment-violations");
      expect(result.output).toContain("blockingLabelOnHint");
      expect(result.status).not.toBe(0);
    },
    SCENARIO_TIMEOUT_MS,
  );
});
