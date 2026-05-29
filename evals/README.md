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
  static-gate.test.ts        # free; auto-discovered by `bun test`
  code-reviewer.evals.ts     # paid; .evals.ts suffix is OUTSIDE auto-discovery

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

## Two-tier file naming

The gate / paid split is enforced by **file extension**, not by runtime
flags or `describe.skip`:

| Suffix | Discovery | Cost | Command |
|---|---|---|---|
| `*.test.ts` | Auto-discovered by `bun test` | $0 | `bun test` |
| `*.evals.ts` | NOT auto-discovered — must be targeted explicitly | $$ | `bun run test:periodic` |

Bun's default test discovery matches `*.test.{ts,tsx,js,jsx}`. Files named
`*.evals.ts` fall outside that pattern, so `bun test` with no arguments
never loads them — no skipped tests in the output, no surprise model calls.
The paid suite runs only when an explicit path is passed:

- `bun run test:periodic` — runs every `test/*.evals.ts`, sets `EVALS_TIER=periodic` + `EVALS_ALL=1`
- `bun test test/code-reviewer.evals.ts` — ad-hoc single file (needs `ANTHROPIC_API_KEY`)

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
git checkout origin/main && bun test test/code-reviewer.evals.ts
```

If it fails there too, the regression predates your change.

## Adding an agent

1. Write `evals/fixtures/<agent>/<case>/input.md` and `ground-truth.json`.
2. Write `evals/rubrics/<agent>.md`.
3. Add an entry to `E2E_TOUCHFILES` and `E2E_TIERS` in
   `test/helpers/touchfiles.ts`.
4. Write `test/<agent>.evals.ts` mirroring `test/code-reviewer.evals.ts`.
   Use the `.evals.ts` suffix (not `.test.ts`) so `bun test` doesn't pick it up.
5. `bun test` — verify the gate validates the new schemas.
6. `bun test test/<agent>.evals.ts` — run end-to-end (needs `ANTHROPIC_API_KEY`).

Run `bun run eval:list` to see the registered tests and their tiers.
