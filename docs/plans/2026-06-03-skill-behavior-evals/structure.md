---
topic: skill-behavior-evals
date: 2026-06-03
phase: structure
approved: true
approved_at: 2026-06-03T00:00:00Z
revision: 0
---

# Structure: skill-behavior-evals

Delivery is ONE PR (design Decision 4). The slices below order the internal
work so each ends in a green free-tier `bun test` (static gate) and a new eval
that is registered and diff-selectable. The L5 evals themselves are paid and
run periodically/on-demand — they are NOT exercised by `bun test`; the
per-slice acceptance test is "static gate green + eval registered &
diff-selectable", all verifiable for free.

Per design Risk #4 (template drift), the template audit ships first (Slice 1)
so every later slice copies the corrected shape.

## Triage of the 13 executable skills (design Open-question #1, Risk #2)

How cheaply can `claude -p` drive each skill and assert an observable property?

- **Self-contained** — no prior pipeline artifacts needed. Get a clean L5
  eval: `git-commit`, `changelog`, `team-question`, `eng-design-doc-review`,
  `team-fix`.
- **Light prior state** — one upstream artifact, seedable as a deterministic
  guardrail fixture (design's option (a)): `team-research` (seed
  `questions.md`), `team-design` (seed `research.md`+`task.md`),
  `team-structure` (seed `design.md`), `team-plan` (seed `structure.md`).
- **Heavy prior state** — multi-phase setup too costly to seed honestly for a
  behavioral property; **demoted to L2 tripwires** (design's option (b)):
  `team` (orchestrator — no single artifact, walks all phases),
  `team-worktree` (git side effects, no findings artifact),
  `team-pr` (needs full implemented branch + git remote),
  `team-implement` (needs approved structure + plan + worktree + tests).
  These four get L2 wiring/content tripwires in Slice 6, not L5 evals.

### Slice 1: Audit the template + first self-contained L5 eval (walking skeleton)
**Goal:** A plugin developer can change the `git-commit` skill prompt and have
a registered behavioral eval that the harness selects for that change, on top
of a template (`code-reviewer`) confirmed to match TESTING.md.
**Layers touched:** audit `tests/code-reviewer.evals.ts` + `evals/rubrics/code-reviewer.md` + `evals/fixtures/code-reviewer/planted-null-deref/` against TESTING.md (fix only concrete deviations, design Decision 3); new `evals/fixtures/git-commit/<case>/{input.md,ground-truth.json}`, `evals/rubrics/git-commit.md`, `tests/git-commit.evals.ts`, `E2E_TOUCHFILES`+`E2E_TIERS` entries in `tests/helpers/touchfiles.ts`.
**Tests:** `static-gate` (git-commit fixture loads, rubric exists, no dangling entry); `bun test` stays green and money-free; `git-commit` eval is diff-selectable (touchfile glob `skills/git-commit/**` resolves via selector).
**Verification checkpoint:** `bun test` green; `bun run eval:select` (or equivalent) lists `git-commit` when `skills/git-commit/**` is in the diff; manual read confirms the code-reviewer audit deviations (if any) are fixed and documented in the PR.
**Atomic commit message:** `test(evals): audit code-reviewer template and add git-commit L5 eval`

### Slice 2: Remaining self-contained L5 evals
**Goal:** A developer editing `changelog`, `team-question`, `eng-design-doc-review`, or `team-fix` gets a behavioral eval that the harness selects for that change — the four skills that need no prior pipeline state.
**Layers touched:** for each of the 4 skills — fixture dir, `evals/rubrics/<skill>.md`, `tests/<skill>.evals.ts`, `E2E_TOUCHFILES`+`E2E_TIERS` entries. Resolve design Open-question #2 here: `changelog`/`git-commit` emit a text artifact, not a findings list — if `bugs[]`/`minimum_detection` cannot express the property, extend the rubric with an `llm`/`deterministic` criterion rather than contriving a `bugs[]` entry (note the chosen shape per skill in the PR).
**Tests:** `static-gate` (all 4 fixtures load, 4 rubrics exist, no dangling entries); `bun test` green and money-free; each of the 4 evals is diff-selectable.
**Verification checkpoint:** `bun test` green; selector lists each new skill for its own `skills/<skill>/**` diff; each fixture declares an explicit `tier` (design Edge case — wrong tier fails the gate).
**Atomic commit message:** `test(evals): add L5 evals for changelog, team-question, eng-design-doc-review, team-fix`

### Slice 3: Light-prior-state L5 evals — upstream-half of pipeline
**Goal:** A developer editing `team-research` or `team-design` gets a behavioral eval driven by a seeded deterministic guardrail fixture (the minimal prior artifact), proving the design's option (a) works before the heavier slices copy it.
**Layers touched:** `team-research` fixture seeds a `questions.md` in `input.md`/`deps`; `team-design` fixture seeds `research.md`+`task.md`. Each gets rubric, `tests/<skill>.evals.ts`, touchfile+tier entries. Tier these as **gate** only if the seeded property is deterministic; otherwise **periodic** (design Edge case — tiering trap).
**Tests:** `static-gate` (both fixtures load with non-empty `deps` seeding prior state, both rubrics exist); `bun test` green; both evals diff-selectable.
**Verification checkpoint:** `bun test` green; each fixture's seeded prior-state artifact is present in `deps` and the eval's working-dir setup; selector resolves both skills.
**Atomic commit message:** `test(evals): add seeded-state L5 evals for team-research and team-design`

### Slice 4: Light-prior-state L5 evals — downstream-half of pipeline
**Goal:** A developer editing `team-structure` or `team-plan` gets a behavioral eval driven by a seeded prior artifact (`design.md` for structure, `structure.md` for plan).
**Layers touched:** `team-structure` fixture seeds `design.md`; `team-plan` fixture seeds `structure.md`. Each gets rubric, `tests/<skill>.evals.ts`, touchfile+tier entries. Same gate/periodic triage as Slice 3.
**Tests:** `static-gate` (both fixtures load, both rubrics exist, no dangling entries); `bun test` green; both evals diff-selectable.
**Verification checkpoint:** `bun test` green; seeded prior artifacts present; selector resolves both skills; first-run budget baseline absent must not falsely flag (design Edge case — floor of 3 in `assertNoBudgetRegressions`).
**Atomic commit message:** `test(evals): add seeded-state L5 evals for team-structure and team-plan`

### Slice 5: L2 tripwires for zero-coverage methodology lenses
**Goal:** A developer editing a methodology lens that has zero free-tier coverage today gets a free, fast tripwire that pins its load-bearing instructions — the design's chosen L2 path for surfaces with no L5 behavioral output (Decision 1).
**Layers touched:** extend `tests/methodology.test.ts` (or a sibling `*.test.ts`) with content/wiring assertions for the zero-coverage lenses in scope: `documenting-decisions`, `product-requirements-doc`, `technical-design-doc`, `writing-prose`, `systematic-debugging`, `test-driven-bug-fix`, `test-first-development`. (`changelog`, `git-commit`, `eng-design-doc-review` already gain L5 in Slices 1–2.) Skip the lenses design `## Out of scope` excludes.
**Tests:** new L2 assertions in `bun test` pass (<100ms, free); each asserts a present load-bearing phrase/wiring per the existing `methodology.test.ts` pattern.
**Verification checkpoint:** `bun test` green; one passing assertion per zero-coverage lens; no `*.evals.ts` or model call introduced (design Edge case — paid-call leakage guard).
**Atomic commit message:** `test(tripwire): add L2 content tripwires for zero-coverage methodology lenses`

### Slice 6: Demote heavy-prior-state skills to L2 tripwires
**Goal:** A developer editing `team`, `team-worktree`, `team-pr`, or `team-implement` gets a free L2 wiring tripwire — the design's explicit option (b) for skills with no cheap self-contained behavioral property (Risk #2).
**Layers touched:** extend `tests/protocol.test.ts` (already covers `team`, `team-worktree`, `team-implement`, `team-pr` wiring) with the specific load-bearing-contract assertions that stand in for the absent L5; document in the PR why each is L2-not-L5 (heavy multi-phase prior state). No fixtures/rubrics/evals created for these four (design Edge case — no empty fixture dir without a rubric).
**Tests:** new L2 assertions in `bun test` pass (free, fast); `static-gate` confirms no dangling fixture/rubric/touchfile entry was introduced for the demoted skills.
**Verification checkpoint:** `bun test` green; `static-gate` reports no fixture dir without a matching rubric and no touchfile entry without an eval; the four demoted skills each have a passing L2 assertion and zero L5 artifacts.
**Atomic commit message:** `test(tripwire): demote heavy-state pipeline skills to L2 wiring tripwires`

## Cross-slice concerns
- **Template correctness (Slice 1, blocking).** The code-reviewer audit must
  land first; every later slice copies the corrected `.evals.ts` cascade
  (`outcomeJudge` deterministic-first → `judgeReviewerOutput` gated → collector
  → `assertNoBudgetRegressions`). If the audit changes the template, Slices 2–4
  copy the fixed shape.
- **Static-gate invariant (every slice).** `tests/static-gate.test.ts` is the
  single free gate that ties the slices together: every new fixture dir needs a
  matching `evals/rubrics/<skill>.md`, every `E2E_TOUCHFILES` entry needs a
  corresponding eval, `agent` frontmatter must equal the parent dir name, and
  `tier ∈ {gate, periodic}`. Each slice's acceptance includes a clean
  static-gate run with no dangling entries.
- **Touchfiles registry (Slices 1–4).** All `E2E_TOUCHFILES`/`E2E_TIERS` edits
  touch the one file `tests/helpers/touchfiles.ts`; that file is in
  `GLOBAL_TOUCHFILES`, so editing it re-selects all evals — expected, not a
  defect.
- **Gate vs. periodic tiering (Slices 1–4, design Edge case + §4).** Apply
  TESTING.md §4: "sometimes-red-for-no-reason? → periodic; deterministic
  guardrail → gate." Live-model output-count evals are `periodic` (mirrors the
  existing `planted-null-deref` → periodic). Seeded deterministic guardrails
  may be `gate`. Misclassifying a stochastic eval as `gate` is the primary
  failure mode — decide explicitly per fixture during plan/implement.
- **Ground-truth schema fit (Slice 2, design Open-question #2).** Text-artifact
  skills (`changelog`, `git-commit`) may not fit `bugs[]`/`minimum_detection`;
  the rubric-criterion extension is the escape hatch, decided per skill.

## Out of structure
- L5 behavioral evals for the 16 pure methodology lenses (no executable
  surface — research Q12, design Out of scope).
- L2 tripwires for lenses that already have free-tier coverage:
  `engineering-standards`, `solid-principles`, `product-thinking`,
  `refactoring-to-patterns`, `agent-open-questions`, `qrspi-workflow`,
  `worktree-isolation`, `progress-tracking`.
- Rebasing/merging/salvaging the unmerged agent-evals worktree (design
  Decision 2).
- New `LLM_JUDGE_TOUCHFILES` / L6 quality benchmarks beyond the existing
  deterministic-first cascade, unless a skill demonstrably needs subjective
  grading.
- Changing harness helpers (`session-runner`, `llm-judge`, `eval-store`) — used
  as-is.
- New CI workflows — existing `behavioral-evals.yml` (periodic) and
  `harness-checks.yml` (free gate) absorb the new tests.
