# Behavioral evals for pipeline agents

This directory ships fixtures, rubrics, and stored results for the behavioral
regression harness. The harness code lives in `test/` and runs under `bun test`.

## Layout

```
test/
  helpers/
    session-runner.ts   # spawns `claude -p`, streams NDJSON, parses transcript
    eval-store.ts       # persist + compare + budget-regression detection
    touchfiles.ts       # diff-based test selection
    llm-judge.ts        # deterministic-first + Sonnet/Haiku scoring
    fixtures.ts         # frontmatter + ground-truth loaders
  static-gate.test.ts   # offline schema validation (free)
  code-reviewer-e2e.test.ts   # gated by EVALS=1

scripts/
  eval-select.ts        # `bun run eval:select` — which tests would run today
  eval-list.ts          # `bun run eval:list` — every known test + tier
  eval-compare.ts       # `bun run eval:compare <prev> <curr>`

evals/
  fixtures/<agent>/<case>/
    input.md            # synthetic task with YAML frontmatter (agent, tier, deps)
    ground-truth.json   # planted bugs + minimum_detection
  rubrics/<agent>.md    # numbered criteria, deterministic | llm
  results/              # generated JSON, one file per run (gitignored)
```

## Three tiers

| Tier | Cost | Command |
|---|---|---|
| Static (gate) | $0 | `bun test` |
| E2E | ~$0.10–$1 per case | `EVALS=1 bun test` (real `claude -p`) |
| LLM-judge | ~$0.005 (Haiku) – $0.05 (Sonnet) per call | bundled into `EVALS=1 bun test` |

`bun test` runs only the static tier — no model calls, no `ANTHROPIC_API_KEY`,
no cost. CI runs this on every PR.

`EVALS=1 bun test` enables the paid tiers. Requires `ANTHROPIC_API_KEY`. CI
runs this weekly on a cron (Mon 06:00 UTC) plus on `workflow_dispatch`.

## Environment

| Var | Purpose | Default |
|---|---|---|
| `EVALS` | Enable paid tests; `bun test` skips E2E/judge tiers when unset | unset |
| `EVALS_ALL` | Ignore diff-based selection; run every test | unset |
| `EVALS_TIER` | Filter to one tier — `gate` or `periodic` | unset (all) |
| `EVALS_MODEL` | Override the default model for the agent under test | `claude-sonnet-4-6` |
| `EVALS_CONCURRENCY` | Max parallel tests | 15 |
| `EVALS_BASE` | Base ref for diff-based selection | `origin/main` (fallback chain) |
| `EVALS_RESULTS_ROOT` | Override result storage root | `evals/results/` |
| `EVALS_MOCK_AGENT` | NDJSON file replayed instead of spawning `claude` | unset |
| `ANTHROPIC_API_KEY` | Required for paid tiers | — |

## Fixture format

`evals/fixtures/<agent>/<case>/input.md`:

```yaml
---
agent: code-reviewer
tier: periodic           # 'gate' or 'periodic'
deps:                    # diff-matching globs; '*' single-segment, '**' multi-segment
  - "agents/code-reviewer.md"
---
synthetic task body for the agent
```

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

## Run history & comparison

Every run writes `<version>-<branch>-<tier>-<timestamp>.json` to
`evals/results/`. On finalize, `EvalCollector.finalize()` finds the previous
run on the same branch+tier and prints a comparison to stderr:

- regressions (verdict pass → fail) listed first
- improvements (verdict fail → pass)
- additions / removals
- ≥20% deltas on cost or duration
- **budget regressions** (≥2× growth in tool calls or turns) — fail CI

Manually: `bun run eval:compare evals/results/<a>.json evals/results/<b>.json`.

## Blame protocol

When an eval fails on your branch, rerun on the base before blaming the
branch:

```
git checkout origin/main && EVALS=1 bun test test/code-reviewer-e2e.test.ts
```

If it fails there too, the regression predates your change.

## Adding an agent

1. Write `evals/fixtures/<agent>/<case>/input.md` and `ground-truth.json`.
2. Write `evals/rubrics/<agent>.md`.
3. Add an entry to `E2E_TOUCHFILES` and `E2E_TIERS` in
   `test/helpers/touchfiles.ts`.
4. Write `test/<agent>-e2e.test.ts` mirroring `test/code-reviewer-e2e.test.ts`.
5. `bun test` — verify the gate validates the new schemas.
6. `EVALS=1 EVALS_ALL=1 bun test test/<agent>-e2e.test.ts` — run end-to-end.

Run `bun run eval:list` to see the registered tests and their tiers.
