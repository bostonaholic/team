---
topic: skill-behavior-evals
date: 2026-06-03
phase: design
approved: true
approved_at: 2026-06-03T00:00:00Z
revision: 0
---

# Design: skill-behavior-evals

## Current state

The behavioral-eval harness is fully built but barely populated. The six-layer
strategy lives in `TESTING.md` (the source of truth). The free tier
(`bun test`, L1–L4) is healthy: `tests/methodology.test.ts`,
`tests/architecture.test.ts`, `tests/protocol.test.ts`, and
`tests/progress-tracking.test.ts` assert L2 content/wiring contracts on a
subset of skills, and `tests/static-gate.test.ts` enforces fixture/rubric
structure. The paid tier (L5/L6, `bun run test:evals`) has **exactly one**
test: `tests/code-reviewer.evals.ts`, with one fixture
(`evals/fixtures/code-reviewer/planted-null-deref/`) and one rubric
(`evals/rubrics/code-reviewer.md`).

The diff-selection wiring in `tests/helpers/touchfiles.ts` mirrors this
sparsity: `E2E_TOUCHFILES` (`:9`) and `E2E_TIERS` (`:28`) each have one entry
(`planted-null-deref` → `periodic`); `LLM_JUDGE_TOUCHFILES` (`:16`) is an empty
stub. The canonical eval shape is the code-reviewer flow:
`testIfSelected` → `loadFixture` → `runAgentTest` → `outcomeJudge`
(deterministic, from `ground-truth.json`) → `judgeReviewerOutput` (LLM, gated
behind a structural check) → `collector.addTest` → `expect` assertions →
`afterAll` finalize + `assertNoBudgetRegressions`.

Research established the core scoping fact (Q12): of 29 skills, only 13 are
**executable entry-point skills** that emit observable artifacts when driven
via `claude -p` (`team`, `team-question`, `team-research`, `team-design`,
`team-structure`, `team-plan`, `team-worktree`, `team-implement`, `team-pr`,
`team-fix`, `eng-design-doc-review`, `git-commit`, `changelog`). The other 16
are **pure methodology lenses** loaded as reference context — they have no
standalone L5 behavioral surface. Ten skills have **zero** free-tier content
coverage today (`changelog`, `documenting-decisions`, `git-commit`,
`product-requirements-doc`, `technical-design-doc`, `writing-prose`,
`eng-design-doc-review`, `systematic-debugging`, `test-driven-bug-fix`,
`test-first-development`).

## Desired end state

After this change, every skill with a testable behavioral property has coverage
at the layer TESTING.md sanctions for it — not a uniform L5 eval forced onto
surfaces that can't produce one. Concretely:

- Each of the 13 executable entry-point skills has a fixture under
  `evals/fixtures/<skill>/<case>/`, a rubric at `evals/rubrics/<skill>.md`, an
  eval at `tests/<skill>.evals.ts`, and `E2E_TOUCHFILES`/`E2E_TIERS` entries —
  all green through the static gate.
- The methodology lenses with zero free-tier coverage gain L2 content
  tripwires (extending the existing `tests/methodology.test.ts` pattern), so
  their load-bearing instructions are pinned cheaply and for free.
- `tests/code-reviewer.evals.ts` has been audited against TESTING.md and
  conforms (deviations, if any, fixed).
- `bun test` (free) stays green and money-free; `tests/static-gate.test.ts`
  passes with no dangling fixture/rubric/touchfile entries.

The named user is the **plugin developer** who changes a skill's prompt and
needs the harness — not manual smoke-testing — to catch the regression before
it ships. The demand signal is direct: the user asked for it, and the existing
single eval proves the pattern is wanted but unfinished.

## Patterns to follow

- **L5 eval shape:** mirror `tests/code-reviewer.evals.ts` exactly — the
  deterministic-first cascade (`outcomeJudge` before any model call), the
  `testIfSelected` wrapper, the `EvalCollector` + `assertNoBudgetRegressions`
  budget guard in `afterAll`.
- **Fixture contract:** `evals/fixtures/<name>/<case>/{input.md,ground-truth.json}`;
  `input.md` frontmatter `agent` must equal the parent dir name, `tier` ∈
  `{gate, periodic}`, `deps` non-empty; `ground-truth.json` carries `bugs[]` +
  `minimum_detection`. Enforced by `tests/static-gate.test.ts` /
  `tests/helpers/fixtures.ts:115`.
- **Rubric contract:** `evals/rubrics/<name>.md` with ≥1 numbered criterion,
  each `kind: deterministic` or `kind: llm`. See `evals/rubrics/code-reviewer.md`.
- **Diff-selection wiring:** add `E2E_TOUCHFILES` (`touchfiles.ts:9`) and
  `E2E_TIERS` (`:28`) entries per new eval; `GLOBAL_TOUCHFILES` needs no
  per-test entry.
- **L2 lens tripwire shape:** extend `tests/methodology.test.ts` — read the
  `SKILL.md`, assert load-bearing phrases/wiring are present. Free, <100ms.
- **Judge cascade:** gate every model call behind a deterministic structural
  check (`judgeReviewerOutput` pattern); never call a model unconditionally.

## Decisions made

1. **Eval scope — "Audit lenses for L2 gaps too" (chosen).** Write L5
   behavioral evals only for the 13 executable entry-point skills that emit
   observable artifacts; additionally add free L2 tripwires for the methodology
   lenses with zero free-tier coverage. Do NOT force L5 onto pure lenses.
   *Alternative rejected:* "Literally all 29 get L5" — contradicts TESTING.md
   §1/§5 (push checks down; build L5 only where a stochastic surface warrants
   it) and would pay for empty/flaky evals on surfaces with no behavioral
   output. This decision interprets the task's "all skills" as "every skill at
   the layer it warrants," which is the honest reading of the stated intent.

2. **Prior work — "Ignore, design fresh" (chosen).** Design skill evals from
   scratch against current `main` + TESTING.md. The 13 agent `.evals.ts` files
   in the unmerged worktree (`.claude/worktrees/2026-05-29-evals-all-agents-skills/`)
   are reference-only; we do not inherit their patterns or rebase them.
   *Alternative rejected:* "Adopt the worktree as baseline" — risks importing
   unvetted deviations from TESTING.md blind, and that worktree targets agents,
   not the skill surfaces this topic covers.

3. **Existing eval — "Audit, fix only if it deviates" (chosen).** Auditing
   `tests/code-reviewer.evals.ts` against TESTING.md is the
   template-validation step (it becomes the template all new evals copy). Fix
   only concrete deviations found; no speculative rewrite.
   *Alternative rejected:* "Full rewrite to a shared template" — refactors
   working code and expands scope beyond what the task asks.

4. **Slicing / delivery — "One PR, all skills" (chosen).** All work lands in a
   single PR. The structure phase will still decompose it into internal
   vertical slices for ordered execution, but delivery is one PR.
   *Alternative rejected:* "Vertical slice 1 = one skill" as separate PRs —
   the user explicitly chose single-PR delivery. *Risk noted below:* a single
   flaky periodic eval must not block the gate subset (mitigated by correct
   gate/periodic tiering, Edge cases).

## Out of scope

- L5 behavioral evals for the 16 pure methodology lenses — they have no
  standalone executable surface (research Q12).
- L2 tripwires for lenses that already have free-tier coverage
  (`engineering-standards`, `solid-principles`, `product-thinking`,
  `refactoring-to-patterns`, `agent-open-questions`, `qrspi-workflow`,
  `worktree-isolation`, `progress-tracking`).
- Rebasing, merging, or salvaging the unmerged agent-evals worktree.
- L6 model-as-judge quality benchmarks for the new skills beyond the
  deterministic-first cascade already in the code-reviewer pattern (no new
  `LLM_JUDGE_TOUCHFILES` surface unless a skill demonstrably needs subjective
  grading).
- Changing the harness helpers themselves (`session-runner`, `llm-judge`,
  `eval-store`) — they are consumed as-is.
- New CI workflows; the existing `behavioral-evals.yml` (periodic) and
  `harness-checks.yml` (free gate) absorb the new tests.

## Edge cases

- **Boundary — one fixture per skill is the floor.** Each L5 skill ships at
  least one fixture case; static-gate requires a matching rubric, so an empty
  `evals/fixtures/<skill>/` dir must not be created without its rubric.
- **Invalid input — frontmatter `agent` mismatch.** If `input.md`'s `agent`
  value ≠ parent dir name, `parseFrontmatter` throws and static-gate fails;
  every new fixture must name its skill exactly.
- **Invalid input — wrong tier value.** `tier` outside `{gate, periodic}` fails
  the gate; each fixture declares one explicitly.
- **Failure path — `claude -p` returns non-success.** The eval pass condition
  requires `exitReason === "success"`; a spawn/timeout failure fails the test
  cleanly rather than passing vacuously.
- **Failure path — model variance on output count.** L5 evals score on
  floors/bands (`minimum_detection`, `MIN_REASON_SUBSTANCE`), never exact
  match, so legitimate model variance does not flake the gate.
- **Concurrency — budget regression baseline.** `assertNoBudgetRegressions`
  compares against the previous run on the same branch+tier; first runs of new
  evals have no baseline and must not falsely flag (floor of 3 applies).
- **Authorization — none.** Evals run in CI with `EVALS_ANTHROPIC_API_KEY`; no
  per-skill auth surface exists. Local runs without the key skip the paid tier.
- **Resource limits — paid-call leakage into free tier.** A new `.evals.ts`
  file must keep the `.evals.ts` suffix so `bun test` never discovers it; a
  stray model call in a `*.test.ts` file would poison the free base (guard via
  the existing free/paid split).
- **Tiering — flaky periodic must not gate.** Each new eval is classified per
  TESTING.md §4: deterministic guardrails → `gate`; quality/variance-prone →
  `periodic`. Misclassifying a stochastic eval as `gate` is the primary
  failure mode and is checked at structure time.

## Open questions (deferred)

- Per-skill: which single observable behavior is the **deterministic guardrail**
  worth gating on (vs. a periodic quality check)? Resolved per-skill during
  structure/plan as each fixture is authored.
- Whether `changelog` and `git-commit` (output is a text artifact, not a
  findings list) need a `ground-truth.json` shape beyond `bugs[]` /
  `minimum_detection`, or a small rubric extension. Surface in structure if the
  current schema doesn't fit.

## Risks

- **Scope realism.** "Audit lenses for L2 gaps too" plus 13 L5 evals in one PR
  is large; the structure phase must slice it into independently-verifiable
  internal slices or the PR becomes unreviewable.
- **Fixture authoring cost.** Each L5 fixture needs a realistic `input.md` and a
  defensible `ground-truth.json`; thin or contrived fixtures produce evals that
  pass without testing anything (assumption standing in for demand — flag if a
  fixture can't express a real behavioral property, that skill may not warrant
  L5).
- **Periodic suite cost.** 13 new live-model evals raise weekly spend; rely on
  diff-selection (§3) and correct gate/periodic tiering to keep per-change cost
  bounded.
- **Template drift.** If the code-reviewer audit finds deviations, fixing them
  changes the template all new evals copy — author the audit fix first so new
  evals copy the corrected shape, not the deviating one.
