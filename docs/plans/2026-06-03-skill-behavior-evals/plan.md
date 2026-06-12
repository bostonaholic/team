---
topic: skill-behavior-evals
date: 2026-06-03
phase: plan
---

# Plan: skill-behavior-evals

## Context

Populate the behavioral-eval harness (`TESTING.md` source of truth) with
coverage for the executable skills it currently lacks: audit the lone L5
template (`code-reviewer`), add L5 evals for the 9 self-contained /
light-prior-state executable skills, and add free L2 tripwires for the
zero-coverage methodology lenses plus the four heavy-prior-state skills demoted
from L5. Delivery is one PR; the 6 slices below order the internal work per the
approved `structure.md`. Every slice ends in a green, money-free `bun test`.

**Global invariant for every slice:** `bun test` (free tier, L1–L4) must stay
green and money-free — never introduce a model call into a `*.test.ts` file,
and keep every new eval in a `*.evals.ts` file so Bun's auto-discovery never
loads it. Every new fixture must declare `tier ∈ {gate, periodic}` explicitly
(`tests/helpers/fixtures.ts:84` throws otherwise) and a non-empty `deps`
(`:92`). Every new fixture dir needs a matching `evals/rubrics/<skill>.md`
(`tests/static-gate.test.ts:61`). Every `E2E_TOUCHFILES` entry needs a
corresponding eval and an `E2E_TIERS` entry.

## L5 fixture-authoring contract (applies to Slices 1–4)

Every L5 skill ships the same four-part cascade, copied from the audited
`code-reviewer` template. For skill `<skill>` with case `<case>`:

1. `evals/fixtures/<skill>/<case>/input.md` — frontmatter:
   `agent: <skill>` (MUST equal parent dir name), `tier: gate|periodic`,
   `deps:` YAML list including `skills/<skill>/**` (the diff-selection glob)
   plus any agent file the skill drives. Body = the prompt context / seed.
2. `evals/fixtures/<skill>/<case>/ground-truth.json` — `{ "bugs": [...],
   "minimum_detection": N, "max_false_positives"?: N }`. Each bug has
   `id`, `description`, `detection_hint` (case-insensitive regex matched by
   `outcomeJudge`/`matchesHint`, `llm-judge.ts:142`). **Text-artifact escape
   hatch (design Open-question #2):** for skills whose output is prose not a
   findings list (`git-commit`, `changelog`), `bugs[]` entries express
   *required-property* hints (e.g. an imperative-mood phrase, a section
   heading) rather than planted defects — `outcomeJudge` only does regex
   presence, so a "bug" is really "this property must appear." If even that
   contrives, leave a single representative `bugs[]` entry to satisfy the
   static gate (`bugs.length > 0`, `static-gate.test.ts:50`) and push the real
   judgment into an `llm`-kind rubric criterion. Note the chosen shape per
   skill in the PR body.
3. `evals/rubrics/<skill>.md` — frontmatter `agent: <skill>`; ≥1 numbered
   criterion (`/^\s*\d+\.\s+/m`, `static-gate.test.ts:107`), each declaring
   `kind: deterministic` or `kind: llm`. Mirror `evals/rubrics/code-reviewer.md`.
4. `tests/<skill>.evals.ts` — mirror `tests/code-reviewer.evals.ts` exactly:
   `testIfSelected` → `loadFixture` → `runAgentTest` → `outcomeJudge`
   (deterministic, no model) → optional gated LLM judge → `collector.addTest`
   → `expect` assertions → `afterAll` `collector.finalize()` +
   `assertNoBudgetRegressions`. One `EvalCollector("e2e")` per file.
5. `tests/helpers/touchfiles.ts` — add `"<case>": ["skills/<skill>/**", ...]`
   to `E2E_TOUCHFILES` and `"<case>": "gate"|"periodic"` to `E2E_TIERS`. The
   `testIfSelected` name MUST equal the `E2E_TOUCHFILES`/`E2E_TIERS` key.

**Gate vs. periodic rule (TESTING.md §4):** live-model output-count /
quality evals are `periodic` (mirrors `planted-null-deref`). A seeded
deterministic guardrail (the output must/never-contain a specific token,
scored only by `outcomeJudge` with no model call) may be `gate`. When in
doubt, `periodic` — misclassifying a stochastic eval as `gate` is the primary
failure mode.

---

## Slices

### Slice 1: Audit the template + first self-contained L5 eval (git-commit)

**Acceptance tests** (from structure.md):
- `static-gate: git-commit/<case> frontmatter + ground-truth load` — fixture
  parses, `agent` equals dir, `tier` valid, `bugs[]` non-empty.
- `static-gate: every fixture has a matching rubric` — `evals/rubrics/git-commit.md` exists.
- git-commit eval is diff-selectable — `selectTests` returns `git-commit`
  when `skills/git-commit/**` is in the diff.

**Steps:**

1. `tests/code-reviewer.evals.ts` — **audit against TESTING.md, fix only
   concrete deviations [sequential, blocking].** Concrete-deviation checklist
   (fix if violated; otherwise leave as-is per design Decision 3, no
   speculative rewrite):
   - **Deterministic-first cascade present** — `outcomeJudge` (no model) is
     called and asserted before `judgeReviewerOutput` (gated model). Present
     at `:66`/`:72`. ✓ likely no change.
   - **Model call is gated** — the LLM judge must sit behind a structural
     check (`judgeReviewerOutput` gates on the Conventional-Comment regex,
     `llm-judge.ts:228`). ✓ likely no change.
   - **`.evals.ts` suffix** so `bun test` never discovers it (TESTING.md §5
     free/paid line). ✓.
   - **`testIfSelected` wrapper** (not bare `test`) so diff-selection +
     EVALS_TIER gate execution. ✓ (`:42`).
   - **Budget guard** — `afterAll` calls `collector.finalize()` +
     `assertNoBudgetRegressions(collector)`. ✓ (`:111`).
   - **Pass on floors/bands, not exact match** — `minimum_detection` floor +
     `MIN_REASON_SUBSTANCE` band (TESTING.md L6 / §8). ✓ (`:98`–`:103`).
   - **Failure path** — `exitReason === "success"` is part of the pass
     condition so a spawn/timeout fails cleanly (design Edge case). ✓ (`:97`).
   Only edit if one of the above is genuinely absent/wrong. Document in the PR
   whether the audit produced changes (likely none — note "conforms").
2. `evals/fixtures/git-commit/<case>/input.md` — new. `agent: git-commit`.
   `deps: [skills/git-commit/**]`. Pick a self-contained case (no prior
   pipeline artifact): body provides a small staged diff + instruction to
   produce a Conventional-Commit message. The observable guardrail: subject is
   imperative-mood, `<type>[scope]: <desc>` shape, ≤50-char subject, no
   trailing period (load-bearing rules from `skills/git-commit/SKILL.md`
   "The 50/72 Rule" + "Conventional Commits"). `[parallel]`
3. `evals/fixtures/git-commit/<case>/ground-truth.json` — new. Use the
   text-artifact escape hatch: `bugs[]` entries are required-property hints
   (e.g. `detection_hint: "^(feat|fix|refactor|test|docs|chore|perf|ci|revert)(\\(.+\\))?: "`),
   `minimum_detection` a floor. `[parallel]`
4. `evals/rubrics/git-commit.md` — new. `agent: git-commit`; numbered criteria:
   (1) Conventional-Commit subject shape (`kind: deterministic`), (2)
   imperative mood + no trailing period (`kind: llm` if regex can't capture
   it). `[parallel]`
5. `tests/git-commit.evals.ts` — new. Mirror the template. If the subject-shape
   guardrail is fully deterministic (regex-only via `outcomeJudge`), this case
   may be `gate`; if it needs the LLM mood check, `periodic`. `[sequential]`
6. `tests/helpers/touchfiles.ts` — add `git-commit` to `E2E_TOUCHFILES`
   (`["skills/git-commit/**"]`) and `E2E_TIERS` (tier per step 5). `[sequential]`

**Verification:** `bun test` green (static gate validates the git-commit
fixture/rubric, no model call). Confirm diff-selection: with
`skills/git-commit/**` in the diff, the selector returns `git-commit`. Manual
read confirms the code-reviewer audit verdict is documented.

**Commit:** `test(evals): audit code-reviewer template and add git-commit L5 eval`

---

### Slice 2: Remaining self-contained L5 evals

Skills: `changelog`, `team-question`, `eng-design-doc-review`, `team-fix`.
None need a prior pipeline artifact.

**Acceptance tests** (from structure.md):
- `static-gate` — all 4 fixtures load, 4 rubrics exist, no dangling entry.
- Each of the 4 evals is diff-selectable for its own `skills/<skill>/**` diff.

**Steps:** For each of the 4 skills, follow the L5 fixture-authoring contract
(fixture dir, ground-truth, rubric, `tests/<skill>.evals.ts`, touchfiles
entry). Per-skill notes:

1. `changelog` — text-artifact escape hatch (same as git-commit). Seed body
   = a list of commit subjects; guardrail = Keep-a-Changelog section headings
   (`### Added`/`### Fixed`) present and `chore:`/`test:`/`refactor:` commits
   excluded from output (load-bearing Include/Exclude rules,
   `skills/changelog/SKILL.md`). `periodic` (filtering is judgment-laden).
2. `team-question` — drives the questioner; observable artifacts are
   `task.md` + `questions.md`. Guardrail: research-neutral questions emitted
   (no feature framing leaks into `questions.md`). `periodic`.
3. `eng-design-doc-review` — drives the adversarial design-doc audit; body
   seeds a small `design.md` excerpt with a planted gap. Guardrail: the
   review surfaces the planted gap (`bugs[]` with a `detection_hint`). This
   is the closest analog to `code-reviewer` and can use `judgeReviewerOutput`
   or a custom gated judge. `periodic`.
4. `team-fix` — drives the compressed bug-fix flow; body seeds a tiny repo
   state + bug report. Guardrail: a failing-test-first step appears before the
   fix (load-bearing test-first ordering). `periodic`.

5. `tests/helpers/touchfiles.ts` — add all 4 `E2E_TOUCHFILES` +
   `E2E_TIERS` entries (`skills/<skill>/**` globs). `[sequential, single file]`

**Verification:** `bun test` green; static gate shows 4 new fixture/rubric
pairs with no dangling entries; selector resolves each new skill for its own
diff; each fixture declares an explicit `tier`.

**Commit:** `test(evals): add L5 evals for changelog, team-question, eng-design-doc-review, team-fix`

---

### Slice 3: Light-prior-state L5 evals — upstream half (team-research, team-design)

These need a seeded upstream artifact. **Seeding mechanism (concrete, applies
to Slices 3–4):** the fixture `input.md` *body* embeds the seed artifact's
full text inside a fenced block labeled with its target filename (e.g. a
```` ```markdown questions.md ```` block). The `tests/<skill>.evals.ts` parses
that block out of `fixture.body` and, after `mkdtempSync`, writes it into the
temp `workDir` at the path the skill expects (e.g. `<workDir>/docs/plans/<id>/questions.md`)
**before** calling `runAgentTest({ workingDirectory: workDir, ... })`. The
prompt then instructs the skill to run against that working dir. `deps` lists
`skills/<skill>/**` so the eval is diff-selected on skill edits; the embedded
seed lives in `input.md` (≤50 KB, `FIXTURE_SIZE_CAP`). This keeps the
harness helpers unchanged (design Out-of-scope) — the seeding is pure
test-file file-writing, not a `runAgentTest` change.

**Acceptance tests** (from structure.md):
- `static-gate` — both fixtures load with non-empty `deps` seeding prior
  state; both rubrics exist.
- Both evals diff-selectable.

**Steps:**

1. `evals/fixtures/team-research/<case>/input.md` — `agent: team-research`,
   `deps: [skills/team-research/**]`. Body embeds a seed `questions.md`
   (neutral research questions) in a fenced block. `[parallel]`
2. `evals/fixtures/team-research/<case>/ground-truth.json` — guardrail:
   output `research.md` answers the seeded questions and reuses the topic
   slug. `detection_hint`s on expected codebase-fact phrasing. `[parallel]`
3. `evals/rubrics/team-research.md` — numbered criteria for research-fact
   grounding. `[parallel]`
4. `tests/team-research.evals.ts` — mirror template; **add the seed-writing
   step** (parse embedded `questions.md` from `fixture.body`, write into
   `workDir` before `runAgentTest`). Tier: `gate` only if the seeded property
   is checked purely by `outcomeJudge` (deterministic); else `periodic`.
   `[sequential]`
5. `evals/fixtures/team-design/<case>/{input.md,ground-truth.json}` — body
   embeds seed `research.md` + `task.md` (two fenced blocks). Guardrail: the
   design enumerates explicit open questions and copies the topic verbatim.
   `[parallel]`
6. `evals/rubrics/team-design.md` — numbered criteria. `[parallel]`
7. `tests/team-design.evals.ts` — mirror template + seed-writing (two files).
   Tier per the gate/periodic rule. `[sequential]`
8. `tests/helpers/touchfiles.ts` — add `team-research`, `team-design` to
   `E2E_TOUCHFILES` + `E2E_TIERS`. `[sequential, single file]`

**Verification:** `bun test` green; each fixture's seeded artifact is present
in `deps` and written into the eval's working dir before spawn; selector
resolves both skills.

**Commit:** `test(evals): add seeded-state L5 evals for team-research and team-design`

---

### Slice 4: Light-prior-state L5 evals — downstream half (team-structure, team-plan)

Same seeding mechanism as Slice 3.

**Acceptance tests** (from structure.md):
- `static-gate` — both fixtures load, both rubrics exist, no dangling entries.
- Both evals diff-selectable.

**Steps:**

1. `evals/fixtures/team-structure/<case>/{input.md,ground-truth.json}` — body
   embeds seed `design.md`. Guardrail: output `structure.md` breaks work into
   vertical slices each with a verification checkpoint, copies topic verbatim.
   `[parallel]`
2. `evals/rubrics/team-structure.md` — numbered criteria. `[parallel]`
3. `tests/team-structure.evals.ts` — mirror template + seed-write `design.md`.
   Tier per gate/periodic rule. `[sequential]`
4. `evals/fixtures/team-plan/<case>/{input.md,ground-truth.json}` — body
   embeds seed `structure.md`. Guardrail: output `plan.md` expands each
   structure slice into file-level steps with acceptance-test mappings.
   `[parallel]`
5. `evals/rubrics/team-plan.md` — numbered criteria. `[parallel]`
6. `tests/team-plan.evals.ts` — mirror template + seed-write `structure.md`.
   Tier per rule. `[sequential]`
7. `tests/helpers/touchfiles.ts` — add `team-structure`, `team-plan` to
   `E2E_TOUCHFILES` + `E2E_TIERS`. `[sequential, single file]`

**Verification:** `bun test` green; seeded prior artifacts present; selector
resolves both skills; first-run-with-no-baseline must not falsely flag —
`assertNoBudgetRegressions` floor of 3 covers this (design Edge case), no
action needed beyond confirming the eval doesn't assert a baseline exists.

**Commit:** `test(evals): add seeded-state L5 evals for team-structure and team-plan`

---

### Slice 5: L2 tripwires for zero-coverage methodology lenses

Lenses in scope (zero free-tier coverage today, not gaining L5 elsewhere):
`documenting-decisions`, `product-requirements-doc`, `technical-design-doc`,
`writing-prose`, `systematic-debugging`, `test-driven-bug-fix`,
`test-first-development`. (`changelog`, `git-commit`, `eng-design-doc-review`
gain L5 in Slices 1–2 and are excluded here.)

**Acceptance tests** (from structure.md):
- New L2 assertions pass in `bun test` (<100ms, free); one passing assertion
  per zero-coverage lens; no `*.evals.ts` or model call introduced.

**Steps:**

1. `tests/methodology.test.ts` — extend with a new `describe` block per lens,
   following the existing `engineering-standards` / `product-thinking` pattern
   (read `skills/<lens>/SKILL.md` via `read()`, assert `existsSync`, assert
   `name: <lens>` frontmatter, then assert ≥1 load-bearing phrase). Pin these
   specific load-bearing phrases (read each SKILL.md to confirm exact strings
   before asserting; use case-insensitive regex where wording may drift):
   - `documenting-decisions` — the ADR contract (e.g. "Context", "Decision",
     "Consequences" headings; "Architecture Decision Record").
   - `product-requirements-doc` — the PRD section contract (problem,
     users/personas, success metrics, scope).
   - `technical-design-doc` — current state / desired end state / decisions /
     open questions section contract.
   - `writing-prose` — the prose-quality directives (active voice, concision,
     "one idea per sentence" or equivalent load-bearing rule).
   - `systematic-debugging` — reproduce-first / form-a-hypothesis ordering
     ("reproduce", "hypothesis", "narrow").
   - `test-driven-bug-fix` — write-a-failing-test-that-reproduces-the-bug-first
     ("failing test", "reproduce", "before the fix").
   - `test-first-development` — write-the-test-before-the-code ("test first",
     "red", "before implementation").
   Each `describe` is a free L2 tripwire — no `runAgentTest`, no
   `@anthropic-ai/sdk` import.

**Verification:** `bun test` green; one passing assertion per lens; grep the
diff to confirm no `*.evals.ts` file and no model/SDK import was added
(design Edge case — paid-call leakage guard).

**Commit:** `test(tripwire): add L2 content tripwires for zero-coverage methodology lenses`

---

### Slice 6: Demote heavy-prior-state skills to L2 tripwires

Skills: `team`, `team-worktree`, `team-pr`, `team-implement`. No cheap
self-contained behavioral property (multi-phase prior state) — L2 wiring
tripwires stand in for the absent L5. No fixtures/rubrics/evals created for
these four (design Edge case — no empty fixture dir without a rubric, no
touchfile entry without an eval).

**Acceptance tests** (from structure.md):
- New L2 assertions pass in `bun test` (free, fast).
- `static-gate` confirms no dangling fixture/rubric/touchfile entry was
  introduced for the demoted skills.

**Steps:**

1. `tests/protocol.test.ts` — extend the existing wiring coverage (which
   already touches `team`, `team-worktree`, `team-implement`, `team-pr`) with
   the specific load-bearing-contract assertions standing in for the absent
   L5. Follow the existing `read()` + regex-on-SKILL.md pattern. Pin
   (confirm exact strings in each SKILL.md before asserting):
   - `team` — orchestrator walks the QRSPI phase table in order; two human
     gates (design approval, structure approval). Assert the phase-sequence
     and gate language is present.
   - `team-worktree` — reads `repos.md`, runs per-repo `git worktree add`,
     records `## Worktrees` (already partly asserted in the multi-repo block;
     add the load-bearing single-repo worktree-creation contract if not
     present).
   - `team-pr` — opens a draft PR automatically (`gh pr create --draft`,
     "do not stop to ask") — already asserted; add the
     commit-then-PR ordering contract if a load-bearing phrase is missing.
   - `team-implement` — requires approved structure + plan + worktree before
     execution; the test-first → slice → 5-reviewer verify sub-pipeline.
     Assert the prerequisite-and-sub-pipeline language is present.
   Do NOT create any `evals/fixtures/<skill>/`, `evals/rubrics/<skill>.md`,
   or `E2E_TOUCHFILES`/`E2E_TIERS` entry for these four.

**Verification:** `bun test` green; `static-gate` reports no fixture dir
without a matching rubric and no touchfile entry without an eval; each of the
four demoted skills has a passing L2 assertion and zero L5 artifacts. PR body
documents why each is L2-not-L5 (heavy multi-phase prior state).

**Commit:** `test(tripwire): demote heavy-state pipeline skills to L2 wiring tripwires`

---

## Done Criteria

- All acceptance tests for every slice pass.
- `bun test` (free tier) stays green and money-free across every slice — no
  model call in any `*.test.ts`, every eval kept in `*.evals.ts`.
- `tests/static-gate.test.ts` passes with no dangling fixture/rubric/touchfile
  entries: every fixture dir has a matching rubric, every `E2E_TOUCHFILES`
  entry has an eval and an `E2E_TIERS` entry, every fixture `agent` equals its
  dir name and declares `tier ∈ {gate, periodic}` with non-empty `deps`.
- Each new L5 eval is diff-selectable: `skills/<skill>/**` in the diff selects
  that eval; the seeded-state evals (Slices 3–4) write their upstream artifact
  into the working dir before spawning the model.
- The 7 zero-coverage lenses (Slice 5) and 4 demoted skills (Slice 6) each
  have ≥1 passing free L2 assertion.
- The `code-reviewer` template audit verdict is documented in the PR; any
  fix landed in Slice 1 before later slices copied the shape.
