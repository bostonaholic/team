---
topic: skill-behavior-evals
date: 2026-06-03
phase: questions
---

# Research Questions: skill-behavior-evals

## Codebase context
- Scope: `tests/` (harness), `tests/helpers/` (helpers), `evals/` (fixtures,
  rubrics, results), `skills/` (29 skill directories), `agents/` (13 agents).
- Vocabulary:
  - **evals file** — a `tests/*.evals.ts` file; excluded from `bun test`
    auto-discovery by the `.evals.ts` suffix; runs via `bun run test:evals`.
  - **fixture** — an `evals/fixtures/<name>/<case>/` directory containing
    `input.md` (with YAML frontmatter `agent`, `tier`, `deps`) and
    `ground-truth.json`.
  - **rubric** — an `evals/rubrics/<name>.md` file declaring numbered scoring
    criteria with `kind: deterministic` or `kind: llm`.
  - **touchfiles** — the `E2E_TOUCHFILES` and `LLM_JUDGE_TOUCHFILES` maps in
    `tests/helpers/touchfiles.ts` that bind test names to source-file globs
    for diff-based selection.
  - **gate / periodic** — the tier classification in `E2E_TIERS` that
    determines whether a test blocks merges or runs on a schedule.

## Topology

1. What is the complete list of `*.evals.ts` files under `tests/`? Are any
   skill eval files present besides `tests/code-reviewer.evals.ts`?

2. What fixture directories exist under `evals/fixtures/` and what rubric
   files exist under `evals/rubrics/`? List all agent/case combinations that
   are currently covered.

3. Which entries in `tests/helpers/touchfiles.ts` (`E2E_TOUCHFILES`,
   `LLM_JUDGE_TOUCHFILES`, `E2E_TIERS`) correspond to currently-present
   `.evals.ts` files, and which are placeholders or stubs?

4. What free-tier test files (`*.test.ts`) already assert behavioral
   properties of skills — specifically `tests/methodology.test.ts`,
   `tests/architecture.test.ts`, `tests/protocol.test.ts`, and
   `tests/static-gate.test.ts`? Which skills or agents have zero coverage
   in either the free or the paid tier today?

## Conventions

5. What shape does `tests/code-reviewer.evals.ts` follow exactly? Enumerate
   the imports it uses, the helper functions it calls (`testIfSelected`,
   `loadFixture`, `runAgentTest`, `outcomeJudge`, `judgeReviewerOutput`,
   `EvalCollector`, `assertNoBudgetRegressions`), and the assertion pattern
   it applies.

6. What fields does a `fixture/input.md` frontmatter block require, and what
   does `tests/helpers/fixtures.ts` (`loadFixture`, `parseFrontmatter`,
   `validateGroundTruth`) enforce at load time? What would cause a fixture to
   fail the static gate in `tests/static-gate.test.ts`?

7. What public surface does `tests/helpers/llm-judge.ts` expose? List every
   exported function and interface. Which judge functions are
   deterministic-first (gate the model call behind a structural check) and
   which call the model unconditionally?

8. What does `tests/helpers/session-runner.ts` expose via `runAgentTest` and
   `RunAgentTestOptions`? What environment variables does it honor
   (`EVALS_MODEL`, `EVALS_MOCK_AGENT`, `EVALS_CASE_NAME`), and what mock
   seam does it provide for offline testing?

## Constraints

9. What contracts does `tests/static-gate.test.ts` enforce that any new
   fixture or rubric must satisfy? Include the size cap, required
   frontmatter fields, and the "every fixture has a matching rubric" rule.

10. What does `tests/helpers/touchfiles.ts` require for a new test to be
    eligible for diff-based selection? Specifically: what must be added to
    `E2E_TOUCHFILES`, `E2E_TIERS`, and `GLOBAL_TOUCHFILES` for a new
    eval test to be correctly selected and tiered?

11. What does the `evals/rubrics/code-reviewer.md` rubric file look like in
    terms of structure and declared criteria kinds (`deterministic` vs `llm`)?
    What fields does `tests/static-gate.test.ts` assert a rubric must have?

12. Which skills under `skills/` expose a concrete prompt or instruction
    set that an agent executes (i.e. would produce observable, assertable
    output when driven via `claude -p`), versus skills that are pure
    methodology lenses loaded only as reference context?

## Reference points

13. In `tests/code-reviewer.evals.ts`, how does the test combine the
    outcome judge (deterministic, from `ground-truth.json`) with the LLM
    judge (`judgeReviewerOutput`), and what is the pass condition expressed
    as a conjunction of those two scores?

14. What is the exact file-path convention for a new fixture case? For
    example, if a skill named `foo` has a case named `bar`, where do
    `input.md` and `ground-truth.json` land, and what `agent` value must
    the `input.md` frontmatter declare?
