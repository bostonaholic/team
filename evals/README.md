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

The gate / paid split is enforced by **file extension**, not by runtime
flags or `describe.skip`:

| Suffix | Discovery | Cost | Command |
|---|---|---|---|
| `*.test.ts` | Auto-discovered by `bun test` | $0 | `bun test` |
| `*.evals.ts` | NOT auto-discovered — must be targeted explicitly | $$ | `bun run test:evals` |

Bun's default test discovery matches `*.test.{ts,tsx,js,jsx}`. Files named
`*.evals.ts` fall outside that pattern, so `bun test` with no arguments
never loads them — no skipped tests in the output, no surprise model calls.
The paid suite runs only when an explicit path is passed:

- `bun run test:evals` — loads every `./tests/*.evals.ts`, but runs only the diff-selected tests
- `bun run test:evals:all` — forces every registered eval with `EVALS_ALL=1`
- `bun test ./tests/code-reviewer.evals.ts` — ad-hoc single file (needs `EVALS_ANTHROPIC_API_KEY`)

> **Path must be `./`-prefixed.** Bun treats a bare `tests/foo.evals.ts`
> argument as a *name filter* (matches nothing here), not a path. Always
> pass `./tests/…`.

Within a paid file, each test is registered through `testIfSelected`, which
consults the selector: `EVALS_TIER` and diff-based selection decide whether
the test runs or is registered as `test.skip`. `EVALS_ALL=1` is an explicit
escape hatch for full scheduled/manual sweeps.

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
validated at load time. The `agent` field names the **agent or skill under
test** and MUST equal the fixture's parent-directory name (e.g. a fixture under
`evals/fixtures/git-commit/` declares `agent: git-commit`). `deps` must list at
least one glob — an empty or missing `deps` would make the fixture invisible to
diff selection, so the loader rejects it rather than letting it silently never
run.

For a skill whose output is prose rather than a findings list (e.g.
`git-commit`, `changelog`), `bugs[]` entries express *required-property* hints
— a regex the output MUST contain (a section heading, a subject shape) — rather
than a planted defect. The subjective half of the property (mood, filtering,
ordering) is pushed into an `llm`-kind rubric criterion.

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

The `agent` frontmatter field names the agent or skill under test and equals
the rubric filename stem (`evals/rubrics/git-commit.md` → `agent: git-commit`).
`deterministic` criteria run first with regex / ground-truth counts. The LLM
is only invoked when an `llm` criterion is present and the structural gates
have passed. Haiku for narrow rubrics; Sonnet for nuanced ones.

Both tiers run in the live eval, and every covered eval follows the same
deterministic-first cascade. The template `tests/code-reviewer.evals.ts` calls
`outcomeJudge` (deterministic planted-bug detection) **and**
`judgeReviewerOutput` (LLM reasoning-quality score), and passes only when
the bug is detected *and* `reason_substance >= 3`. Mentioning the hint in
junk prose is not enough to pass. The skill evals mirror this: each runs
`outcomeJudge` first and gates an `llm` judge (`judgeReviewerOutput` or the
generic `judgeQuality`) behind the deterministic check. Both scores are
recorded in `judge_scores` on the result entry.

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
git checkout origin/main && bun test ./tests/<failing-eval>.evals.ts
```

(or `bun run test:evals` to rerun the whole diff-selected paid suite). If it
fails there too, the regression predates your change.

## Adding an eval (agent or skill)

The steps are identical whether the unit under test is a pipeline agent or an
executable skill — `<name>` is the agent or skill name, and it must match the
fixture parent-dir name, the rubric filename stem, and the `agent:` frontmatter
field throughout.

1. Write `evals/fixtures/<name>/<case>/input.md` and `ground-truth.json`. For a
   prose-output skill, `bugs[]` are required-property hints (see Fixture
   format) rather than planted defects.
2. Write `evals/rubrics/<name>.md`.
3. Add an entry to `E2E_TOUCHFILES` and `E2E_TIERS` in
   `tests/helpers/touchfiles.ts`. The touchfile globs include the source the
   eval depends on (`skills/<name>/**` or `agents/<name>.md`, plus any
   methodology skill or shared helper it uses).
4. Write `tests/<name>.evals.ts` mirroring `tests/code-reviewer.evals.ts`.
   Use the `.evals.ts` suffix (not `.test.ts`) so `bun test` doesn't pick it
   up, and register the test through `testIfSelected(name, ...)` so tier /
   diff selection applies. A skill that needs upstream pipeline state seeds it
   from the fixture body with `extractSeed` (see the seeded-state evals) and
   writes it into the working dir before `runAgentTest`.
5. Add the eval file, fixture directory, and rubric to that test's
   `E2E_TOUCHFILES` entry. The free gate enforces this so fixture/rubric edits
   cannot be diff-selected out.
6. `bun test` — verify the gate validates the new schemas. `skill-eval-coverage.test.ts`
   additionally enforces that every covered skill has all four artifacts.
7. `bun test ./tests/<name>.evals.ts` — run end-to-end (needs `EVALS_ANTHROPIC_API_KEY`).

Any **new CI step** that consumes `EVALS_ANTHROPIC_API_KEY` or spawns
`claude` on a `pull_request` event MUST carry the canonical trust `if:` so
untrusted authors never spend tokens. Copy the expression from the live
job-level `if:` on the `behavioral-evals` job in
`.github/workflows/behavioral-evals.yml` — that is the authoritative,
event-aware copy source (`!startsWith(github.event_name, 'pull_request') ||
contains(...)`). The contract comment on the `harness-checks` job in
`.github/workflows/harness-checks.yml` carries the same expression for
reference, but the live `if:` is the canonical form to copy.

Both `behavioral-evals.yml` and `evals.yml` now carry live copies of this
canonical trust `if:` expression. They must stay byte-identical, and the
`TRUST_EXPR` tripwire in `tests/static-gate.test.ts` enforces that — any drift
fails the free gate.

Run `bun run eval:list` to see the registered tests and their tiers.
