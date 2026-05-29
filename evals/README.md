# evals/

Behavioral regression harness for the Team plugin's pipeline agents.

Three tiers:

1. **Gate** (`evals/gate/run.sh`) — structural assertions only. No model
   calls. Runs in under 5 seconds. Safe to wire into a pre-push or PR
   check. No `ANTHROPIC_API_KEY` required.
2. **E2E** (`evals/e2e/run.sh`) — invokes an agent via `claude -p
   --output-format stream-json` against hand-authored fixtures under
   `evals/fixtures/<agent>/<case>/`, captures the output, hands it to
   the judge tier, and writes a per-case result JSON. **Costs money.**
3. **Judge** (`evals/lib/judge.mjs`, invoked by the E2E runner) —
   deterministic criteria first (regex-match planted bugs against
   `ground-truth.json`); LLM-scored criteria only for the subjective
   axes declared `kind: llm` in `evals/rubrics/<agent>.md`.

## Running

```bash
# Gate (free, fast): runs on every save.
bash evals/gate/run.sh

# E2E + judge for one agent. Periodic-only by default — opt in
# with PERIODIC=1 to acknowledge the cost.
ANTHROPIC_API_KEY=... PERIODIC=1 bash evals/e2e/run.sh code-reviewer

# Run every eval, regardless of `git diff` selection.
ALL=1 bash evals/e2e/run.sh

# Resume a killed run (replays only the cases not yet recorded as
# completed in `_partial-e2e.json`).
bash evals/e2e/run.sh code-reviewer --resume <run-id>

# Garbage-collect old result directories (keeps last 10).
bash evals/e2e/gc.sh
```

## Cost warning

A full E2E run is roughly **1 agent call + 1 judge call per fixture**.
Slice 1 ships one fixture; expect about 10 model calls per full periodic
run as more fixtures land. The runner refuses to call the model unless
`PERIODIC=1` is set — this is the cost-control opt-in.

## Required environment

- `ANTHROPIC_API_KEY` — required for the E2E and judge tiers. The runner
  exits early with a clear message when it is unset.
- `PERIODIC=1` — required to actually invoke the model. Acknowledges the
  cost; mirrors the design's periodic-only-by-default rule.

The gate tier needs neither.

## Selection (`evals/lib/select.mjs`)

By default the E2E runner only invokes cases whose `deps:` frontmatter
glob matches `git diff --name-only origin/main...HEAD`. Override with
`ALL=1` (run everything) or `EVALS_BASE=<branch>` (use a different base
branch). On a shallow clone or detached HEAD, the selector falls back to
"run all" and warns on stderr — never silently selects nothing.

## Blame protocol

When an eval fails on your branch, run it on the base branch first to
confirm it isn't a pre-existing failure. The runner's failure block
prints the exact command:

```bash
git checkout origin/main && bash evals/e2e/run.sh <agent>
```

Only blame the branch if the eval passes on `origin/main` and fails on
yours. This protocol is baked into the runner output so the loop is
obvious; the contributor never has to remember it from memory.

## Layout

```
evals/
├── README.md                      # this file
├── e2e/
│   ├── run.sh                     # entry point — agent + judge tiers
│   ├── compare.sh                 # named-criterion regression callouts
│   └── gc.sh                      # garbage-collect old run dirs
├── gate/
│   └── run.sh                     # free, structural checks only
├── lib/
│   ├── run-agent.mjs              # subprocess wrapper around `claude -p`
│   ├── judge.mjs                  # deterministic + LLM judging
│   ├── result-store.mjs           # SCHEMA_VERSION=1, atomic writes, gc
│   ├── select.mjs                 # diff-based case selection
│   └── compare.mjs                # findPreviousRun + compareEvalResults
├── fixtures/
│   └── <agent>/<case>/
│       ├── input.md               # frontmatter + synthetic input
│       └── ground-truth.json      # planted bugs + thresholds
├── rubrics/
│   └── <agent>.md                 # numbered criteria, kind: per-criterion
└── results/
    └── <run-id>/
        ├── <case>.json            # per-case result, schema_version=1
        └── _partial-e2e.json      # resume checkpoint (atomic .tmp+rename)
```

## CI integration

Deferred. A `bd` follow-up ticket tracks the GitHub Actions integration.
Until that lands, run the gate locally on every save and the periodic
tier on demand before bumping the underlying model.
