# Behavioral evals for pipeline agents

This directory ships fixtures, rubrics, and stored results for the behavioral
regression harness. The harness code lives in `tests/` and runs under `bun test`.

## Layout

```
tests/
  helpers/
    session-runner.ts   # spawns `claude -p`, streams NDJSON, parses transcript
    eval-store.ts       # persist + compare + budget-regression detection
    touchfiles.ts       # diff-based test selection
    llm-judge.ts        # deterministic-first + Sonnet/Haiku scoring
    fixtures.ts         # frontmatter + ground-truth loaders
    seed.ts             # extractSeed — parse a seeded artifact from a fixture body
    seed.test.ts        # free; L1 unit tests for extractSeed
  static-gate.test.ts        # free; auto-discovered by `bun test`
  skill-eval-coverage.test.ts # free; meta-test — every covered skill has its 4 artifacts
  methodology.test.ts        # free; L2 content tripwires (incl. zero-coverage lenses)
  protocol.test.ts           # free; L2 wiring tripwires (incl. L2-demoted pipeline skills)
  code-reviewer.evals.ts     # paid; .evals.ts suffix is OUTSIDE auto-discovery
  <skill>.evals.ts           # paid; one per covered skill (9 skills + code-reviewer)

scripts/
  eval-select.ts        # `bun run eval:select` — which tests would run today
  eval-list.ts          # `bun run eval:list` — every known test + tier
  eval-compare.ts       # `bun run eval:compare <prev> <curr>`

evals/
  fixtures/<agent-or-skill>/<case>/
    input.md            # synthetic task with YAML frontmatter (agent, tier, deps)
    ground-truth.json   # planted bugs (or required-property hints) + minimum_detection
  rubrics/<agent-or-skill>.md  # numbered criteria, deterministic | llm
  results/              # generated JSON, one file per run (gitignored)
```

## Two-tier file naming

The **file extension** enforces the gate and paid split. Runtime flags and
`describe.skip` do not:

| Suffix | Discovery | Cost | Command |
|---|---|---|---|
| `*.test.ts` | Auto-discovered by `bun test` | $0 | `bun test` |
| `*.evals.ts` | NOT auto-discovered. You must target it explicitly. | $$ | `bun run test:evals` |

Bun's default test discovery matches `*.test.{ts,tsx,js,jsx}`. Files named
`*.evals.ts` fall outside that pattern. `bun test` with no arguments thus
never loads them. The output shows no skipped tests, and no model calls occur.
The paid suite runs only when you give it an explicit path:

- `bun run test:evals` loads every `./tests/*.evals.ts`. It runs only the
  diff-selected tests.
- `bun run test:evals:all` forces every registered eval with `EVALS_ALL=1`.
- `bun test ./tests/code-reviewer.evals.ts` runs one ad-hoc file. It needs
  `EVALS_ANTHROPIC_API_KEY`.

> **Path must be `./`-prefixed.** Bun treats a bare `tests/foo.evals.ts`
> argument as a *name filter* (matches nothing here), not a path. Always
> pass `./tests/…`.

Within a paid file, `testIfSelected` registers each test. It consults the
selector. `EVALS_TIER` and diff-based selection decide if the test runs or
registers as `test.skip`. `EVALS_ALL=1` is an explicit escape hatch for full
scheduled or manual sweeps.

## Environment

| Var | Purpose | Default |
|---|---|---|
| `EVALS_ALL` | Ignore diff-based selection. Run every test. | unset |
| `EVALS_TIER` | Filter to one tier, `gate` or `periodic` | unset (all) |
| `EVALS_MODEL` | Override the default model for the agent under test | `claude-sonnet-4-6` |
| `EVALS_CONCURRENCY` | Max parallel tests | 15 |
| `EVALS_BASE` | Base ref for diff-based selection | `origin/main` (fallback chain) |
| `EVALS_RESULTS_ROOT` | Override result storage root | `evals/results/` |
| `EVALS_MOCK_AGENT` | NDJSON file replayed instead of spawning `claude` | unset |
| `EVALS_MOCK_JUDGE` | JSON file replayed instead of calling the LLM judge | unset |
| `EVALS_ANTHROPIC_API_KEY` | Anthropic API key for the judge (paid tiers). The name is namespaced, so an ambient Claude Code session does not pick it up automatically. This includes the spawned agent under test. The harness passes the key explicitly to the judge's Anthropic SDK client. | n/a |

The live path **throws immediately** with "refusing live spawn" when this key
is absent, empty, or whitespace-only and `EVALS_MOCK_AGENT` is unset. It does
not spawn `claude` and fail later at CLI auth. The judge seam has the same
backstop. Without `EVALS_MOCK_JUDGE`, `getClient` in
`tests/helpers/llm-judge.ts` throws "EVALS_ANTHROPIC_API_KEY is required for
the LLM-judge tier" before any metered call. Set `EVALS_MOCK_AGENT` to replay
a fixture without a key.

Both mock seams have an in-repo consumer. `tests/code-reviewer-replay.test.ts`
replays committed transcripts through the code-reviewer eval offline and
key-free. It runs on every PR for every author, including forks. Its
transcripts live in `tests/fixtures/code-reviewer-replay/`, deliberately
outside `evals/fixtures/`. They are thus plain test data, not eval fixtures,
and none of the fixture contract below applies to them.

In CI the key is an **`evals` environment secret**, not a plain repo secret.
Only the job that declares `environment: evals` can reach it. Token-consuming
jobs also **skip for PR authors who are not OWNER/MEMBER/COLLABORATOR**. Fork
PRs, Dependabot (`CONTRIBUTOR`), and first-time contributors skip by design.
No tokens are spent on their PRs.

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

All three frontmatter fields (`agent`, `tier`, `deps`) are necessary. The
loader validates them at load time. The `agent` field names the
**agent or skill under test**. It MUST equal the fixture's parent-directory
name. For example, a fixture under `evals/fixtures/git-commit/` declares
`agent: git-commit`. `deps` must list at least one glob. An empty or missing
`deps` would make the fixture invisible to diff selection. The loader thus
rejects it, rather than let it never run without warning.

Some skills output prose rather than a findings list, such as `git-commit` and
`changelog`. For those, `bugs[]` entries express *required-property* hints
rather than a planted defect. A hint is a regex that the output MUST contain,
such as a section heading or a subject shape. The subjective half of the
property, such as mood, filtering, and ordering, moves into an `llm`-kind
rubric criterion.

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

`outcomeJudge` counts hint-matches in agent output. It passes when
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

The `agent` frontmatter field names the agent or skill under test. It equals
the rubric filename stem, so `evals/rubrics/git-commit.md` declares
`agent: git-commit`. `deterministic` criteria run first with regex and
ground-truth counts. The harness calls the LLM only when an `llm` criterion is
present and the structural gates passed. Narrow rubrics use Haiku. Nuanced
rubrics use Sonnet.

Both tiers run in the live eval, and every covered eval obeys the same
deterministic-first cascade. The template `tests/code-reviewer.evals.ts` calls
`outcomeJudge` for deterministic planted-bug detection **and**
`judgeReviewerOutput` for the LLM reasoning-quality score. It passes only when
the harness detects the bug *and* `reason_substance >= 3`. A hint mentioned in
junk prose is not enough to pass. The skill evals mirror this design. Each one
runs `outcomeJudge` first. Each one gates an `llm` judge behind that
deterministic check, either `judgeReviewerOutput` or the generic
`judgeQuality`. The harness records both scores in `judge_scores` on the
result entry.

A fixture case can also carry one more deterministic gate beyond the two
rubric criteria. Such a gate lives in the eval file's per-fixture options, not
in `evals/rubrics/<agent>.md`. The planted-time-bomb case's blocking-label
assertion is one example (`requireBlockingLabel` in
`tests/code-reviewer.evals.ts`).

## Run history & comparison

Every run writes `<version>-<branch>-<tier>-<timestamp>.json` to
`evals/results/`. On finalize, `EvalCollector.finalize()` finds the previous
run on the same branch and tier. It prints a comparison to stderr:

- regressions (verdict pass → fail) listed first
- improvements (verdict fail → pass)
- additions / removals
- ≥20% deltas on cost or duration
- **budget regressions** (≥2× growth in tool calls or turns)

Budget regressions do more than print. The eval file's `afterAll` calls
`assertNoBudgetRegressions(collector)`, which throws after `finalize()` writes
the result. A throw in `afterAll` fails the bun run. A run that passes but
costs three times as much thus fails CI. The floor (`minPriorTools` and
`minPriorTurns` = 3) suppresses noise from tiny baselines. A move from 1 to 3
is not a regression.

To compare by hand, run
`bun run eval:compare evals/results/<a>.json evals/results/<b>.json`. It exits
non-zero on a budget regression or a verdict regression.

## CI

Two workflows run the evals:

- **`.github/workflows/pr-evals.yml`** runs on every pull request. It runs the
  evals that the diff selects. It compares `git diff <base>...HEAD` against
  each eval's touchfiles, with no `EVALS_ALL`, so the cost scales with the
  change. It filters to the **gate tier** (`EVALS_TIER: gate`). Periodic evals
  run only in the weekly `periodic-evals.yml`. The workflow upserts one
  `## PR Evals` comment on the PR with a per-suite pass/fail table and the
  cost. `scripts/eval-report.ts` produces the comment body. That script is
  pure, and `tests/eval-report.test.ts` unit-tests it. The workflow is
  **advisory**, because the gate tier is empty by decision and the free suite
  carries offline replay coverage instead. It runs on **same-repo PRs only**,
  because fork PRs have no `EVALS_ANTHROPIC_API_KEY` secret and no write
  token. When the diff selects nothing, which is today's steady state, the
  comment says so.
- **`.github/workflows/periodic-evals.yml`** runs the full periodic tier
  weekly, at 06:00 UTC on Monday, and on manual dispatch. It uploads the
  results as artifacts.

## Blame protocol

When an eval fails on your branch, run it again on the base before you blame
the branch:

```
git checkout origin/main && bun test ./tests/<failing-eval>.evals.ts
```

Run `bun run test:evals` instead to repeat the whole diff-selected paid suite.
If it fails there too, the regression is older than your change.

## Adding an eval (agent or skill)

The steps are identical for a pipeline agent and for an executable skill.
`<name>` is the agent or skill name. It must match the fixture
parent-directory name, the rubric filename stem, and the `agent:` frontmatter
field throughout.

1. Write `evals/fixtures/<name>/<case>/input.md` and `ground-truth.json`. For
   a prose-output skill, `bugs[]` holds required-property hints rather than
   planted defects. See Fixture format above.
2. Write `evals/rubrics/<name>.md`.
3. Add an entry to `E2E_TOUCHFILES` and `E2E_TIERS` in
   `tests/helpers/touchfiles.ts`. The touchfile globs include the source the
   eval depends on (`skills/<name>/**` or `agents/<name>.md`, plus any
   methodology skill or shared helper it uses).
4. Write `tests/<name>.evals.ts` on the model of
   `tests/code-reviewer.evals.ts`. Use the `.evals.ts` suffix, not `.test.ts`,
   so that `bun test` does not pick it up. Register the test through
   `testIfSelected(name, ...)`, so that tier and diff selection apply. A skill
   that needs upstream pipeline state seeds that state from the fixture body
   with `extractSeed`. See the seeded-state evals. It writes the state into
   the working directory before `runAgentTest`.
5. Add the eval file, fixture directory, and rubric to that test's
   `E2E_TOUCHFILES` entry. The free gate enforces this, so that fixture and
   rubric edits cannot be diff-selected out.
6. Run `bun test`. It makes sure that the gate validates the new schemas.
   `skill-eval-coverage.test.ts` also enforces that every covered skill has
   all four artifacts.
7. Run `bun test ./tests/<name>.evals.ts` end-to-end. It needs
   `EVALS_ANTHROPIC_API_KEY`.

Any **new CI step** that consumes `EVALS_ANTHROPIC_API_KEY` or spawns `claude`
on a `pull_request` event MUST carry the canonical trust `if:`. This keeps
untrusted authors from spending tokens. Copy the expression from the live
job-level `if:` on the `periodic-evals` job in
`.github/workflows/periodic-evals.yml`. That job is the authoritative,
event-aware copy source
(`!startsWith(github.event_name, 'pull_request') || contains(...)`). The
contract comment on the `harness-checks` job in
`.github/workflows/harness-checks.yml` carries the same expression for
reference. Copy the live `if:`, which is the canonical form.

Both `periodic-evals.yml` and `pr-evals.yml` now carry live copies of this
canonical trust `if:` expression. They must stay byte-identical. The
`TRUST_EXPR` tripwire in `tests/static-gate.test.ts` enforces this. Any drift
fails the free gate.

**Adding a second fixture to an existing agent:** one `<name>.evals.ts` file
can register several fixture cases through a shared parameterized helper.
`registerPlantedBugEval` in `tests/code-reviewer.evals.ts` is the reference.
Each case is diff-selected on its own, by fixture name, with its own
`E2E_TOUCHFILES` and `E2E_TIERS` entries.

Run `bun run eval:list` to see the registered tests and their tiers.
