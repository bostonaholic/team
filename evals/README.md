# Behavioral Evals

Behavioral regression tests for the Team pipeline's agents and skills. Each
eval spawns a real agent against a fixture, captures its output, and scores it —
either deterministically (detection rate) or with an LLM judge (quality axes).

## Coverage

**13 agents.** Every pipeline agent has a `tests/<agent>.evals.ts` suite:
code-reviewer, file-finder, verifier, test-architect, security-reviewer,
design-author, structure-planner, planner, questioner, researcher,
technical-writer, ux-reviewer, implementer.

- **Detection-rate agents** (file-finder, verifier, test-architect,
  security-reviewer, ux-reviewer) score with the pure `outcomeJudge` — they
  need no LLM judge. They still feed `EVALS_MOCK_AGENT` a transcript so the
  scorer has text to grade.
- **Judgment agents** (design-author, structure-planner, planner, questioner,
  researcher, technical-writer) score with `judgeQuality` on three axes
  (clarity, completeness, actionability), each gated at `>= 3`. Isolation /
  leakage / hallucination edges are checked deterministically (a forbidden
  phrase must NOT appear) rather than by the judge.
- **implementer** runs a real single-slice task in a throwaway git repo and is
  scored by whether the planted acceptance test passes (periodic tier).
- **Hybrid (reference impl): code-reviewer** is neither a pure detection-rate
  nor a pure judgeQuality suite — it combines `outcomeJudge` with
  `judgeReviewerOutput`. Treat it as the conceptual reference when "mirroring
  code-reviewer"; for a concrete gate-tier template (mocks + happy/guard pair),
  copy `tests/file-finder.evals.ts` instead.

**Self-eval recursion guard.** Judgment-agent fixtures are FROZEN predecessor
artifacts captured into `input.md` — never live pipeline output. The frozen
input is what stops `structure-planner` (and friends) from grading themselves.

**28 skills.** Skills split into two groups:

- **17 methodology skills** (loaded by agents) get behavior evals via the
  skill-harness pattern: `tests/skills.evals.ts` is one parameterized suite
  that, for each skill, loads its `SKILL.md` into a generic agent on a
  synthetic task and asserts the skill measurably shifts the output (e.g.
  `git-commit` -> conventional-commit subject; `test-first-development` ->
  test precedes implementation). Each skill registers its own
  `skill:<name>` case so diff-gating and the CI matrix can target one skill.
- **11 orchestration skills** (the `/team-*` routers + `worktree-isolation`)
  get a free structural contract check in `tests/skill-contracts.test.ts`
  (frontmatter keys, required `## ` sections, resolvable referenced paths) —
  no model call needed.

## Layout

```
evals/
  fixtures/<agent>/<case>/        input.md + ground-truth.json (+ mocks/)
  fixtures/skills/<skill>/<case>/ skill fixtures (agent: skills/<skill>)
  rubrics/<agent>.md              numbered scoring criteria
  rubrics/skills/<skill>.md       skill rubrics
  results/                        stored run artifacts (git-ignored)
tests/
  <agent>.evals.ts               paid live-agent suites (*.evals.ts)
  skills.evals.ts                 parameterized 17-skill harness suite
  *.test.ts                       free harness + static/contract gates
  helpers/                        shared harness code
```

## The skill-harness pattern

`tests/helpers/skill-harness.ts` exports `runSkillHarness({skillPath, task})`.
It reads a `SKILL.md`, composes a prompt of the skill body plus the synthetic
task, and delegates to `runAgentTest` — the same spawner the agent evals use.
It does NOT reimplement spawning. Callers then score the output with
`outcomeJudge` / `judgeQuality` / `callJudge`, exactly like an agent eval.

## Free static gates

These `.test.ts` suites run on every PR (no model calls), alongside the harness
unit tests under `tests/helpers/` — currently five:

- `tests/static-gate.test.ts` — validates every `evals/fixtures/<agent>/<case>/`
  one level deep. It SKIPS the `skills/` directory (skill fixtures are nested
  two levels deep and would be mis-walked by the agent enumerator).
- `tests/skill-fixtures.test.ts` — the skills-subtree integrity gate. Walks
  `evals/fixtures/skills/<skill>/<case>/`, asserts the same fixture invariants
  (frontmatter, `input.md` <= 50 KB, non-empty `bugs[]`, numeric
  `minimum_detection`) and that a matching `evals/rubrics/skills/<skill>.md`
  exists with >= 1 numbered criterion.
- `tests/skill-contracts.test.ts` — the 11-orchestration-skill structural
  contract check.
- `tests/matrix-coverage.test.ts` — asserts every `tests/*.evals.ts` is wired
  into the `behavioral-evals.yml` matrix (and every matrix row points at a
  real file), so a suite cannot land unwired.
- `tests/tier-coverage.test.ts` — asserts no eval belongs to a tier that runs
  in zero workflows: every periodic test's suite is a `behavioral-evals.yml`
  matrix row, and every gate test resolves (via the shared
  `tests/helpers/gate-cases.ts` resolver — the SAME one the runner uses) to its
  own fixture dir with the `mocks/agent.ndjson` that `scripts/run-gate-evals.ts`
  needs to run it free and mocked. It also caps each mock at 50 KB.

## Running

```sh
# Free — static/contract/integrity gates + harness unit tests. Runs on every PR.
bun test

# Free + deterministic — ALL gate-tier agent evals, each replayed against its
# OWN recorded mock seams (no API key, no `claude` spawn). Runs on every PR.
# Equivalent: `bun run test:gate` or `dev evals:gate`.
bun scripts/run-gate-evals.ts

# Free + deterministic — replay ONE case's mocked transcript instead of calling
# the model. EVALS_MOCK_AGENT / EVALS_MOCK_JUDGE are GLOBAL single files, so you
# MUST scope to that case with `-t "<agent>-<case>"`; without `-t`, the other
# cases in a multi-case suite get this case's mock and fail. The file arg MUST
# be `./`-prefixed (a bare `tests/foo.evals.ts` is a name filter, not a path).
EVALS_MOCK_AGENT=evals/fixtures/<agent>/<case>/mocks/agent.ndjson \
EVALS_MOCK_JUDGE=evals/fixtures/<agent>/<case>/mocks/judge.json \
EVALS_ALL=1 bun test ./tests/<agent>.evals.ts -t "<agent>-<case>"

# Paid — the full live-agent periodic matrix. Requires EVALS_ANTHROPIC_API_KEY.
bun run test:periodic

# Paid — a single live suite. Requires EVALS_ANTHROPIC_API_KEY.
EVALS_ALL=1 bun test ./tests/code-reviewer.evals.ts
```

The gate runner prints each case's mock alignment, then a per-case PASS/FAIL
list and a summary line — for example:

```text
Gate-tier case -> mock alignment:
  file-finder-empty-input -> evals/fixtures/file-finder/empty-input/mocks/agent.ndjson
  ...
Gate-tier eval cases (mocked, free):
  PASS  file-finder-empty-input
  ...
Gate-tier eval summary: 20 passed, 0 failed (of 20).
```

> `EVALS=1` is NOT a real switch — the harness only reads `EVALS_ALL`,
> `EVALS_TIER`, `EVALS_ANTHROPIC_API_KEY`, and `EVALS_MOCK_*`. Setting `EVALS=1`
> does nothing; plain `bun test` and `EVALS=1 bun test` are identical (the free
> static gate only).

## Mock seams (deterministic CI)

- `EVALS_MOCK_AGENT=<file.ndjson>` replays an agent transcript (NDJSON, one
  event per line). The text the scorer sees is the concatenation of
  `type:"assistant"` -> `message.content[].type:"text"` blocks. See
  `runMocked` and `extractToolCallsAndUsage` in
  `tests/helpers/session-runner.ts`.
- `EVALS_MOCK_JUDGE=<file.json>` replays one judge verdict JSON (the first
  `{...}` block is extracted). See `callJudge` in `tests/helpers/llm-judge.ts`.

Mock fixtures live under each fixture's `mocks/` subdir. Edge-case detection
evals that assert deterministically (e.g. `*-empty-input`, `*-safe-pattern`)
need no `judge.json`. Gate-tier evals use these seams so they run free and
deterministically in CI via `scripts/run-gate-evals.ts` (wired into
`harness-checks.yml` on every PR); periodic-tier evals (ux-reviewer,
implementer, skills) are excluded from the gate path and run only on the weekly
cron.

## Tiers

- **gate** — fast, deterministic; blocks every PR. Run mocked & free by
  `scripts/run-gate-evals.ts` (invoked under `bun` from `harness-checks.yml`).
- **periodic** — live/expensive; run on the weekly cron in
  `.github/workflows/behavioral-evals.yml`.

The `EVALS_TIER=gate|periodic` env filters which fixtures run when driving the
suites directly with `bun test`; the gate-evals script enumerates the gate set
itself from `E2E_TIERS`.

## Adding an eval

1. Create `evals/fixtures/<agent>/<case>/input.md` + `ground-truth.json`.
2. Add `evals/rubrics/<agent>.md` with numbered criteria.
3. Mirror `tests/file-finder.evals.ts` into `tests/<agent>.evals.ts` — it is the
   gate-tier template (mocks + happy/guard pair). (`code-reviewer.evals.ts` is
   the conceptual reference, but it is periodic-only and has no `mocks/` dir.)
4. Wire the test name into `E2E_TOUCHFILES` + `E2E_TIERS` in
   `tests/helpers/touchfiles.ts`.
5. Add a matrix row to `.github/workflows/behavioral-evals.yml`
   (`matrix-coverage.test.ts` enforces this).
6. For a **gate-tier** case, add `evals/fixtures/<agent>/<case>/mocks/agent.ndjson`
   (and `mocks/judge.json` for judgment agents; deterministic edge cases need
   no judge) so `scripts/run-gate-evals.ts` can run it free & mocked.
   `tier-coverage.test.ts` is what enforces that every eval is wired to a
   workflow — it fails the PR if a gate case does not resolve to its own
   fixture dir with an agent mock, or if a periodic suite is missing its matrix
   row.
