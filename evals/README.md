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

## Optional environment

Operator-facing knobs. All defaults below are picked to be safe for an
unattended local run; CI is expected to leave them alone.

| Var | Default | Purpose |
|---|---|---|
| `EVALS_GC_KEEP` | `10` | Number of run directories to retain in `evals/results/`. |
| `EVALS_WALLCLOCK_CAP` | `1800` (sec) | Hard wall-clock cap for a full E2E run. |
| `EVALS_TIMEOUT` | `120` (sec) | Per-case agent subprocess timeout. |
| `EVALS_JUDGE_TIMEOUT` | `90` (sec) | Per-case judge subprocess timeout. |
| `EVALS_BASE` | `origin/main` | Base ref for diff-based case selection. |
| `EVALS_TIER` | unset | Restrict to one tier — `gate` or `periodic`. Unset runs all tiers. Invalid values fail fast. |
| `EVALS_FIXTURE_ROOT` | `evals/fixtures` | Fixture root (must be under repo root or system tempdir). |
| `EVALS_RUBRIC_ROOT` | `evals/rubrics` | Rubric root (same path-confinement constraint). |
| `EVALS_RESULTS_ROOT` | `evals/results` | Results root (same path-confinement constraint). |

## Path & size limits

These constraints are enforced by the runner and `evals/e2e/gc.sh` —
they are not stylistic guidance, they are hard refusals.

- **Path confinement.** Every `EVALS_*_ROOT` (fixture, rubric, results)
  must resolve to a path under the repo root or under the system
  tempdir (`os.tmpdir()`). Anything else fails fast — the runner and
  `gc.sh` refuse to read or delete arbitrary filesystem locations even
  if an env var is misset.
- **Fixture size cap.** `input.md`, `ground-truth.json`, and rubric
  files are capped at **50 KB**. The cap is deliberate: it bounds the
  prompt size the judge ever has to handle, keeping per-case judge cost
  predictable and protecting the model from runaway fixtures. The
  runtime checks the size before paying for a model call.

## Selection (`evals/lib/select.mjs`)

By default the E2E runner only invokes cases whose `deps:` frontmatter
glob matches `git diff --name-only origin/main...HEAD`. Override with
`ALL=1` (run everything) or `EVALS_BASE=<branch>` (use a different base
branch). On a shallow clone or detached HEAD, the selector falls back to
"run all" and warns on stderr — never silently selects nothing.

### `deps:` glob syntax

The `deps:` list in a fixture's `input.md` frontmatter accepts the
following glob constructs (matched against the diff path list):

- `*` matches any run of characters within a single path segment (does
  not cross `/`).
- `**` matches across path segments (zero or more directories).
- Anything else is an exact-string match.

Examples:

- `agents/code-reviewer.md` — exact match; the case runs only when that
  one file changes.
- `agents/**` — recursive; the case runs when any file under `agents/`
  (at any depth) changes.
- `evals/rubrics/*.md` — any single rubric file changing triggers the
  case, but a file under a nested subdirectory does not.

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

## Fixture format

Each fixture lives at `evals/fixtures/<agent>/<case>/` and contains two
files. See `evals/fixtures/code-reviewer/planted-null-deref/` for a live
example.

**`input.md`** — synthetic input handed to the agent under test. Opens
with YAML frontmatter:

- `agent:` — the agent name. Must match the parent directory name under
  `evals/fixtures/`.
- `tier:` — one of `gate` or `periodic`. Set `EVALS_TIER=gate` (or
  `EVALS_TIER=periodic`) on the runner to restrict to that tier; unset
  runs both. Any other value fails fast at selection time. The CI
  workflows lean on this split — `evals.yml` runs the structural gate
  on every PR; `evals-periodic.yml` runs cost-bearing cases on a
  weekly cron with `EVALS_TIER=periodic`.
- `deps:` — YAML list of file globs. The runner matches these against
  `git diff --name-only origin/main...HEAD` (or whichever `EVALS_BASE`
  resolves to). A case runs only when at least one entry matches. See
  [`deps:` glob syntax](#deps-glob-syntax) above.

Everything after the frontmatter is free-form prose: the synthetic input
the agent reads.

**`ground-truth.json`** — the contract the judge checks against:

- `bugs[]` (required) — array of planted-bug records. Each entry carries
  an `id`, a `category`, a `severity`, a `description`, and a
  `detection_hint` regex that the deterministic criterion in the rubric
  matches against the agent's output.
- `minimum_detection` (required) — number in the range `0.0` to `1.0`.
  The fraction of `bugs[]` that must be detected for the deterministic
  criterion to pass.
- `max_false_positives` (optional) — integer cap on bugs the agent
  reports that are not in `bugs[]`.

## Rubric format

Each agent under evaluation has one rubric at `evals/rubrics/<agent>.md`.
See `evals/rubrics/code-reviewer.md` for a live example.

- YAML frontmatter carries `agent:` (must match the file's base name).
- The body is a numbered list of criteria (`1. Title`, `2. Title`, …).
- Each criterion declares its kind inline as `kind: deterministic` or
  `kind: llm`.
- **Deterministic criteria** are computed by the harness — typically a
  regex match between each `bugs[].detection_hint` and the agent's
  output, scored as the detected fraction.
- **LLM criteria** are scored by Sonnet-as-judge on a 1-5 anchor scale.
  The rubric text spells out what 1, 3, and 5 look like so judge runs
  stay calibrated across model upgrades.

## Mock seams (offline testing)

Two env vars short-circuit the model calls so acceptance tests can run
without `ANTHROPIC_API_KEY` and without spending money:

- `EVALS_MOCK_AGENT=<path>` — the file at `<path>` is treated as the
  agent's stdout. A `.sh` suffix runs the file as a shell script (with
  `EVALS_CASE_NAME` exported so it can branch by case).
- `EVALS_MOCK_JUDGE=<path>` — the file at `<path>` is parsed as the
  judge's JSON verdict + criteria payload.

Both **require an existing file path**. Setting `EVALS_MOCK_AGENT=1` or
any boolean-ish value will fail fast with:

```
EVALS_MOCK_AGENT must be a path to an existing file (got: '1'). Set to /path/to/mock-output.json or unset.
```

Working example (see `tests/evals-walking-skeleton-tests.sh`):

```bash
WORKDIR=$(mktemp -d)
cat >"$WORKDIR/mock-agent.txt" <<'EOF'
Found a null deref on line 42.
EOF
cat >"$WORKDIR/mock-judge.json" <<'EOF'
{ "verdict": "pass", "criteria": [
  { "name": "reasoning_quality", "kind": "llm", "score": 4, "evidence": "ok" }
] }
EOF
env -u ANTHROPIC_API_KEY \
  EVALS_MOCK_AGENT="$WORKDIR/mock-agent.txt" \
  EVALS_MOCK_JUDGE="$WORKDIR/mock-judge.json" \
  EVALS_RESULTS_ROOT="$WORKDIR/results" \
  PERIODIC=1 \
  bash evals/e2e/run.sh code-reviewer
```

There is also `EVALS_MOCK_JUDGE_PROMPT_CAPTURE=<path>` for the
prompt-injection test, but it is gated behind `EVALS_TEST_MODE=1` to
prevent a stray env var in production from writing to arbitrary paths.
Set `EVALS_TEST_MODE=1` to enable test-only side effects (currently:
`EVALS_MOCK_JUDGE_PROMPT_CAPTURE`). Unset in normal operation.

## CI integration

Two GitHub Actions workflows under `.github/workflows/`:

- **`evals.yml`** (`Evals (gate)`) — runs on every PR to `main` and on
  `workflow_dispatch`. Executes `bash evals/gate/run.sh` (offline,
  structural) and the 18 `tests/evals-*-tests.sh` acceptance scripts.
  No secrets required.
- **`evals-periodic.yml`** (`Evals (periodic)`) — runs weekly (Monday
  06:00 UTC) and on `workflow_dispatch`. Runs the E2E + judge tier for
  each agent listed in the workflow's `matrix.agent`. Requires the
  `ANTHROPIC_API_KEY` repo secret. Uploads `evals/results/` as an
  artifact with a 90-day retention.

Trigger either workflow on demand from the GitHub UI ("Run workflow")
or via `gh workflow run evals.yml` / `gh workflow run evals-periodic.yml`.
Add new agents to the periodic matrix by appending to the `agent:` list
in `evals-periodic.yml`.
