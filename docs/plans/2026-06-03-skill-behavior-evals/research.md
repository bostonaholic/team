---
topic: skill-behavior-evals
date: 2026-06-03
phase: research
---

# Research: skill-behavior-evals

## Tech Stack
- TypeScript + Bun (`bun:test`), `@anthropic-ai/sdk` for judge calls, Node
  `child_process` for spawning `claude -p`.
- Free tier auto-discovered (`*.test.ts`); paid tier (`*.evals.ts`) excluded
  from discovery by suffix, run via `bun run test:evals`.

## Directory Conventions
- `tests/*.test.ts` — free deterministic gate; auto-discovered by `bun test`.
- `tests/*.evals.ts` — paid E2E tier; run via `bun run test:evals`
  (`EVALS_ALL=1 bun test --concurrent ./tests/*.evals.ts`).
- `tests/helpers/` — fixtures, llm-judge, session-runner, touchfiles,
  eval-store, text.
- `evals/fixtures/<agent>/<case>/` — `input.md` + `ground-truth.json`.
- `evals/rubrics/<agent>.md` — one rubric file per agent name.
- `evals/results/` — persisted run JSON (gitignored).

## Current Coverage (the gap)
- **Only one paid eval exists:** `tests/code-reviewer.evals.ts`.
- **Only one fixture:** `evals/fixtures/code-reviewer/planted-null-deref/`.
- **Only one rubric:** `evals/rubrics/code-reviewer.md`.
- `E2E_TOUCHFILES` (`touchfiles.ts:9`) and `E2E_TIERS` (`touchfiles.ts:28`)
  each have exactly one entry (`planted-null-deref` → `periodic`).
- `LLM_JUDGE_TOUCHFILES` (`touchfiles.ts:16`) is an empty placeholder stub.

## ⚠ Prior unmerged work (decision input)
- file-finder found **13 agent `.evals.ts` files** already written in an
  unmerged worktree at
  `.claude/worktrees/2026-05-29-evals-all-agents-skills/tests/`. They are NOT
  on `main`. This overlaps the present topic and must be reconciled in design
  (reuse / supersede / ignore).

## Q12 — executable vs. methodology skills (the core scoping fact)
Driving the live model only produces observable, assertable output for skills
that contain a concrete executable procedure. Two classes:

- **Executable entry-point skills** (produce artifacts via `claude -p`):
  `team`, `team-question`, `team-research`, `team-design`, `team-structure`,
  `team-plan`, `team-worktree`, `team-implement`, `team-pr`, `team-fix`,
  `eng-design-doc-review`, `git-commit`, `changelog`.
- **Pure methodology lenses** (loaded as reference context, no standalone
  procedure — no independent L5 behavioral surface):
  `code-review`, `engineering-standards`, `solid-principles`,
  `refactoring-to-patterns`, `product-thinking`, `product-requirements-doc`,
  `technical-design-doc`, `writing-prose`, `documenting-decisions`,
  `agent-open-questions`, `qrspi-workflow`, `worktree-isolation`,
  `progress-tracking`, `test-first-development`, `test-driven-bug-fix`,
  `systematic-debugging`.

## Existing free-tier (L2) skill coverage
- `methodology.test.ts` — asserts content of `engineering-standards`,
  `product-thinking`, `solid-principles`, `refactoring-to-patterns`; wiring
  for planner/implementer/code-reviewer/questioner/design-author/structure-planner.
- `architecture.test.ts` — code-review skill linkage for code-reviewer,
  security-reviewer, ux-reviewer, technical-writer; registry sync.
- `protocol.test.ts` — `agent-open-questions`, `qrspi-workflow`, `team`,
  `team-design`, `team-structure`, `team-implement`, `team-pr`,
  `worktree-isolation`, `team-worktree`, `team-research`, `team-fix`.
- `progress-tracking.test.ts` — `progress-tracking` + entry-point wiring.
- Skills with **zero** free-tier content coverage: `changelog`,
  `documenting-decisions`, `git-commit`, `product-requirements-doc`,
  `technical-design-doc`, `writing-prose`, `eng-design-doc-review`,
  `systematic-debugging`, `test-driven-bug-fix`, `test-first-development`.

## Canonical eval shape (`tests/code-reviewer.evals.ts`)
Imports: `afterAll`, `expect` (`bun:test`); `mkdtempSync`/`rmSync`; `tmpdir`;
`join`; `EvalCollector`, `assertNoBudgetRegressions` (eval-store);
`loadFixture` (fixtures); `judgeReviewerOutput`, `outcomeJudge` (llm-judge);
`runAgentTest` (session-runner); `testIfSelected` (touchfiles).

Flow: `testIfSelected(name, fn, timeoutMs)` → `loadFixture` → `runAgentTest`
→ `outcomeJudge` (deterministic, from `ground-truth.json`) →
`judgeReviewerOutput` (LLM, Haiku, gated behind structural check) →
`collector.addTest({...})` → three `expect` assertions → `afterAll`
calls `collector.finalize()` + `assertNoBudgetRegressions(collector)`.

Pass condition (`code-reviewer.evals.ts:74-77`):
`exitReason === "success" AND outcome.passes_minimum AND
review.reason_substance >= MIN_REASON_SUBSTANCE (3)`.

## Helper surfaces
- `runAgentTest(opts)` — `session-runner.ts:241`. `RunAgentTestOptions`:
  `prompt`, `workingDirectory`, `maxTurns?`, `allowedTools?`, `timeout?`,
  `testName?`, `model?`. Returns `SkillTestResult`: `toolCalls`, `exitReason`,
  `duration`, `output`, `costEstimate`, `transcript`, `model`,
  `firstResponseMs`, `maxInterTurnMs`. Env: `EVALS_MODEL` (default
  `claude-sonnet-4-6`), `EVALS_MOCK_AGENT` (NDJSON replay), `EVALS_CASE_NAME`.
- `llm-judge.ts` exports: `extractJson`, `callJudge`, `wrapUntrusted`,
  `matchesHint`, `outcomeJudge`, `judgeQuality`, `judgeReviewerOutput`,
  `_setClientForTests`; interfaces `OutcomeScore`, `QualityScore`,
  `ReviewerScore`. Deterministic-first: `judgeReviewerOutput` gates the model
  call behind a Conventional-Comments regex; `outcomeJudge` never calls a
  model. Unconditional model call: `judgeQuality`. Mock seam:
  `EVALS_MOCK_JUDGE`.
- `loadFixture(agent, caseName, fixtureRoot?)` — `fixtures.ts:115`.
- `testIfSelected(name, fn, timeoutMs?)` — `touchfiles.ts:225`.
- `EvalCollector`, `assertNoBudgetRegressions` — `eval-store.ts` (compares vs.
  previous run on same branch+tier; flags >2× tool/turn growth; floor of 3).

## Contracts new fixtures/rubrics must satisfy (static-gate.test.ts)
- `input.md` frontmatter: `agent` (must equal parent dir name, `:47`), `tier`
  ∈ `["gate","periodic"]`, `deps` (non-empty array). `parseFrontmatter`
  throws otherwise.
- `ground-truth.json`: `bugs[]` (non-empty) + `minimum_detection` (number).
- `input.md` ≤ 50 KB (`FIXTURE_SIZE_CAP = 50*1024`).
- Every fixture agent dir requires `evals/rubrics/<agent>.md` (`:61-67`).
- Every rubric must contain ≥1 numbered criterion (`/^\s*\d+\.\s+/m`).
- Workflow guards: `.github/workflows/behavioral-evals.yml` must exist,
  install `@anthropic-ai/claude-code`, and contain `ANTHROPIC_API_KEY:`.

## Diff-selection wiring for a new test (touchfiles.ts)
- Add `"<name>": ["<glob>", ...]` to `E2E_TOUCHFILES` (`:9`).
- Add `"<name>": "gate" | "periodic"` to `E2E_TIERS` (`:28`).
- `GLOBAL_TOUCHFILES` (`:20-26`) needs no per-test entry — it lists shared
  harness files that re-run everything when changed.
- `LLM_JUDGE_TOUCHFILES` only for an LLM-judge-tier test (none exist yet).

## Fixture path convention
`evals/fixtures/<name>/<case>/input.md` + `ground-truth.json`. The `agent`
frontmatter value must exactly equal `<name>`.

## CI integration
- `.github/workflows/harness-checks.yml` — every PR; runs `bun test` (free
  only), <5s.
- `.github/workflows/behavioral-evals.yml` — weekly (Mon 06:00 UTC) or manual;
  spawns `claude -p`, uploads results 90 days; sets `EVALS_ANTHROPIC_API_KEY`
  + `ANTHROPIC_API_KEY`.
- `package.json`: `test:evals`, `eval:select`, `eval:list`, `eval:compare`.

## Open Questions (for design / human gate)
- "All the other skills" vs. reality: 16 of 29 skills are pure methodology
  lenses with no standalone L5 behavioral surface. TESTING.md says push checks
  down (L1/L2) and only build L5/L6 where a stochastic surface warrants it.
  Scope must be reconciled against this.
- The prior unmerged worktree wrote evals for **agents**, not skills. Reuse,
  supersede, or ignore?
