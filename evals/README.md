# Behavioral Evals

Behavioral regression harness for the Team pipeline agents and skills.

This directory holds fixtures, rubrics, and stored runs. The harness code
(TypeScript + Bun) lives in `tests/`. Two tiers:

- **Static gate** (`bun run test:gate`) — free, runs on every PR. Loads each
  agent/skill fixture, applies the rubric's structural assertions, no API
  calls.
- **E2E + LLM-judge** (`bun run test:periodic`) — paid, nightly + manual.
  Runs the agent end-to-end and scores output with an LLM judge. Requires
  `EVALS_ANTHROPIC_API_KEY`.

See `tests/` for the harness implementation and `evals/*/` for fixtures.

## Coverage

Coverage spans all 13 agents (12 new + code-reviewer) and 28 skills. Every
agent and skill has a fixture.

## Skill harness

The skill harness loads each `SKILL.md`, extracts its rubric block, and
asserts the documented structure is present. See `tests/skills.test.ts`.

## Gate runner

The gate runner (`bun scripts/run-gate-evals.ts`) aggregates every gate
case and exits non-zero on the first rubric failure. CI invokes it via
`bun run test:gate`.

## Tier reference

Within a paid file, each test is registered through `testIfSelected`, which
consults the selector: `EVALS_TIER` and diff-based selection decide whether
the test runs or is registered as `test.skip`. `EVALS_ALL=1` forces all.

## Environment

| Var | Purpose | Default |
|---|---|---|
| `EVALS_ALL` | Ignore diff-based selection; run every test | unset |
| `EVALS_TIER` | Filter to one tier — `gate` or `periodic` | unset (all) |
| `EVALS_MODEL` | Override the default model for the agent under test | `claude-sonnet-4-6` |
| `EVALS_CONCURRENCY` | Max parallel tests | 15 |
| `EVALS_BASE` | Base ref for diff-based selection | `origin/main` (fallback chain) |
| `EVALS_RESULTS_ROOT` | Override result storage root | `evals/results/` |
| `EVALS_MOCK_AGENT` | NDJSON file replayed instead of spawning `claude` | unset |
| `EVALS_MOCK_JUDGE` | JSON file replayed instead of calling the LLM judge | unset |
| `EVALS_ANTHROPIC_API_KEY` | Anthropic API key for the judge (paid tiers). Namespaced so an ambient Claude Code session (incl. the spawned agent under test) won't auto-pick it up; passed explicitly to the judge's Anthropic SDK client. | — |

When this key is absent, empty, or whitespace-only and `EVALS_MOCK_AGENT` is
unset, the live path now **throws immediately** ("refusing live spawn") rather
than spawning `claude` and failing later at CLI auth. Set `EVALS_MOCK_AGENT` to
replay a fixture without a key.

In CI the key is an **`evals` environment secret** (not a plain repo secret),
reachable only by the job declaring `environment: evals`. Token-consuming
jobs are additionally **skipped for PR authors who are not
OWNER/MEMBER/COLLABORATOR** — fork PRs, Dependabot (`CONTRIBUTOR`), and
first-time contributors skip by design, so no tokens are spent on their PRs.

## Fixture format

`evals/fixtures/<agent>/<case>/input.md`:

```yaml
---
agent: code-reviewer
tier: periodic           # 'gate' or 'periodic'
deps:                    # REQUIRED, non-empty. Diff-matching globs;
  - "agents/code-reviewer.md"   # '*' single-segment, '**' multi-segment
---
synthetic task body for the agent
```

All three frontmatter fields (`agent`, `tier`, `deps`) are required and
validated at load time. `deps` must list at least one glob — an empty or
missing `deps` would make the fixture invisible to diff selection, so the
loader rejects it rather than letting it silently never run.

`evals/fixtures/<agent>/<case>/ground-truth.json`:

```json
{
  "bugs": [
    {
      "id": "b1",
      "category": "null-dereference",
      "severity": "high",
      "description": "...",
      "detection_hint": "null deref"
    }
  ],
  "minimum_detection": 1.0,
  "max_false_positives": 1
}
```

`outcomeJudge` counts hint-matches in agent output; passes when
`detected / total_bugs >= minimum_detection`.

## Rubric format

`evals/rubrics/<agent>.md`:

```yaml
---
agent: code-reviewer
---
1. Planted-bug detection (kind: deterministic). ...
2. Reasoning quality (kind: llm). 1-5 scale: ...
```

`deterministic` criteria run first with regex / ground-truth counts. The LLM
is only invoked when an `llm` criterion is present and the structural gates
have passed. Haiku for narrow rubrics; Sonnet for nuanced ones.

Both tiers run in the live eval. `tests/code-reviewer.evals.ts` calls
`outcomeJudge` (deterministic planted-bug detection) **and**
`judgeReviewerOutput` (LLM reasoning-quality score), and passes only when
the bug is detected *and* `reason_substance >= 3`. Mentioning the hint in
junk prose is not enough to pass. Both scores are recorded in
`judge_scores` on the result entry.

## Run history & comparison

Every run writes `<version>-<branch>-<tier>-<timestamp>.json` to
`evals/results/`. On finalize, `EvalCollector.finalize()` finds the previous
run on the same branch+tier and prints a comparison to stderr:

- regressions (verdict pass → fail) listed first
- improvements (verdict fail → pass)
- additions / removals
- ≥20% deltas on cost or duration
- **budget regressions** (≥2× growth in tool calls or turns)

Budget regressions don't just print — the eval file's `afterAll` calls
`assertNoBudgetRegressions(collector)`, which throws after `finalize()`
writes the result. A throw in `afterAll` fails the bun run, so a
passing-but-3×-more-expensive run fails CI. The floor (`minPriorTools`/
`minPriorTurns` = 3) suppresses noise from tiny baselines (1 → 3 isn't a
regression).

Manually: `bun run eval:compare evals/results/<a>.json evals/results/<b>.json`
(exits non-zero on budget regression or verdict regression).

## CI

Two workflows run the evals:

- **`.github/workflows/evals.yml`** runs on every pull request. It runs the
  evals the diff selects (`git diff <base>...HEAD` against each eval's
  touchfiles — no `EVALS_ALL`/`EVALS_TIER`, so cost scales with the change) and
  upserts one `## PR Evals` comment on the PR with a per-suite pass/fail table
  and cost. The comment body is produced by `scripts/eval-report.ts` (pure +
  unit-tested in `tests/eval-report.test.ts`). It is **advisory** — it includes
  stochastic periodic evals, which must not gate merges (see
  [TESTING.md](../TESTING.md)) — and runs on **same-repo PRs only** (fork PRs
  lack the `EVALS_ANTHROPIC_API_KEY` secret and a write token). When the diff
  selects nothing, the comment says so.
- **`.github/workflows/behavioral-evals.yml`** runs the full periodic tier
  weekly (Monday 06:00 UTC) and on manual dispatch, uploading results as
  artifacts.

## Blame protocol

When an eval fails on your branch, rerun on the base before blaming the
branch:

```
git checkout origin/main && bun test ./tests/code-reviewer.evals.ts
```

If it fails there too, the regression predates your change.

## Adding an agent

1. Write `evals/fixtures/<agent>/<case>/input.md` and `ground-truth.json`.
2. Write `evals/rubrics/<agent>.md`.
3. Add an entry to `E2E_TOUCHFILES` and `E2E_TIERS` in
   `tests/helpers/touchfiles.ts`.
4. Write `tests/<agent>.evals.ts` mirroring `tests/code-reviewer.evals.ts`.
   Use the `.evals.ts` suffix (not `.test.ts`) so `bun test` doesn't pick it
   up, and register the test through `testIfSelected(name, ...)` so tier /
   diff selection applies.
5. `bun test` — verify the gate validates the new schemas.
6. `bun test ./tests/<agent>.evals.ts` — run end-to-end (needs `EVALS_ANTHROPIC_API_KEY`).

Any **new CI step** that consumes `EVALS_ANTHROPIC_API_KEY` or spawns
`claude` on a `pull_request` event MUST carry the canonical trust `if:` so
untrusted authors never spend tokens. Copy the expression from the live
job-level `if:` on the `behavioral-evals` job in
`.github/workflows/behavioral-evals.yml` — that is the authoritative,
event-aware copy source (`!startsWith(github.event_name, 'pull_request') ||
contains(...)`). The contract comment on the `harness-checks` job in
`.github/workflows/harness-checks.yml` carries the same expression for
reference, but the live `if:` is the canonical form to copy.

Run `bun run eval:list` to see the registered tests and their tiers.
