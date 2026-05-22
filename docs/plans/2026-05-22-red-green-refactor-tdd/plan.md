---
topic: red-green-refactor-tdd
date: 2026-05-22
phase: plan
---

# Plan: red-green-refactor-tdd

## Context

Reshape the IMPLEMENT phase from `test-architect → implementer → reviewers`
into a per-slice trio `test-architect → red gate → greener → green gate →
refactorer → next slice → 5 reviewers`. See
`docs/plans/2026-05-22-red-green-refactor-tdd/structure.md` for the approved
slice breakdown. All changes happen in the single `team` repo at
`/Users/bostoma/team`; no `repos.md` exists for this topic.

Verification across slices relies on `node
.claude/hooks/check-registry-sync.mjs` exiting 0 (the dev hook enforces
the registry-sync invariant on every commit that adds or removes an
agent file).

## Slices

### Slice 1: test-architect goes per-slice

**Acceptance tests** (from structure.md):
- `test-architect-responsibilities-per-slice` — grep
  `agents/test-architect.md` for "per slice" in its Responsibilities /
  Process section; the previous "every acceptance test from
  `structure.md`" wording is gone.
- `test-architect-emits-test-commit` — grep `agents/test-architect.md`
  for an explicit `test:` commit-subject contract (e.g. `test: <slice>`).
- `team-implement-per-slice-dispatch-loop` — grep
  `skills/team-implement/SKILL.md` `## Execution` for per-slice
  dispatch of `test-architect` (e.g. "for each slice" / "per slice").
- `team-implement-first-slice-boundary` — grep
  `skills/team-implement/SKILL.md` for the explicit first-slice empty
  prior-slice set note.
- `registry-sync-still-passes-slice-1` — `node
  .claude/hooks/check-registry-sync.mjs` exits 0 (no agents added or
  removed in this slice).

**Files:**
- `/Users/bostoma/team/agents/test-architect.md`
- `/Users/bostoma/team/skills/team-implement/SKILL.md`

**Steps:**

1. `[sequential]` `agents/test-architect.md` — In the `## Process`
   section (currently `### 2. Write every test from the structure,
   slice by slice` at line 41), rewrite the responsibilities so the
   agent writes ONLY the failing acceptance tests for the **single
   slice it is dispatched for**. Replace "writes every acceptance
   test from `structure.md`" wording globally with per-slice wording.
   Add a clear "Dispatched per slice" note near the top of `## Process`.
   In the `## Test Architect Report` section, replace the
   slice-by-slice table with a single-slice report shape. Add an
   explicit `## Commit` section stating the agent commits its work as
   `test: <slice>` (one commit per `[repo: <slug>]` group when
   multi-repo). Keep the mechanical-gate prerequisite (all tests fail
   cleanly) intact (per design Decision 3 and structure Slice 1 Tests).

2. `[sequential]` `skills/team-implement/SKILL.md` — In the
   `## Execution` section (lines 68-93), restructure steps 2-4 into a
   per-slice loop: "For each slice in `structure.md`: dispatch
   `test-architect` → mechanical red gate → dispatch `implementer` for
   that slice → next slice". After the loop, keep the existing
   reviewer dispatch (step 5). Add an explicit note: "First slice: the
   prior-slices set is empty; the red gate only checks the current
   slice's tests." Update the `Coordinate progress via TodoWrite. Seed`
   line (line 36-37) from `Test-architect → Mechanical gate →
   Implementer (per slice) → Review round 1` to `Test-architect (per
   slice) → Red gate → Implementer (per slice) → Review round 1`
   (greener/refactorer arrive in Slices 2-3). Update the ASCII
   `## Quality Loop` diagram (lines 95-103) to reflect the per-slice
   shape (no greener/refactorer yet).

**Verification:** Read both edited files; run `node
/Users/bostoma/team/.claude/hooks/check-registry-sync.mjs` and confirm
exit 0. Slice 1 acceptance tests pass.

**Commit:** `refactor(test-architect): dispatch per slice, scope writes to current slice's tests`

### Slice 2: introduce greener and the mechanical green gate

**Acceptance tests** (from structure.md):
- `greener-agent-file-exists` — `test -f agents/greener.md` succeeds.
- `greener-frontmatter-complete` — grep `agents/greener.md` for all
  five required fields (`name:`, `description:`, `model:`, `tools:`,
  `permissionMode:`).
- `greener-scope-fence-present` — grep `agents/greener.md` for an
  explicit scope-fence section forbidding refactoring/abstraction
  beyond a failing test (per design Decision 7).
- `greener-in-registry` — grep `skills/team/registry.json` for a
  `"greener"` entry with `"phase": "IMPLEMENT"` and no `"parallel":
  true`.
- `greener-in-phase-table` — grep `skills/team/SKILL.md` IMPLEMENT row
  for `greener` between `test-architect` and the reviewers.
- `green-gate-documented` — grep `skills/team-implement/SKILL.md` for
  the mechanical green gate semantics: re-run suite, advance only if
  current-slice acceptance tests pass and prior-slice tests still
  pass; on failure re-dispatch greener with typed "green failed" class;
  cap at 3 attempts per slice.
- `implementer-normal-dispatch-retired` — grep `agents/implementer.md`
  confirms the file no longer contains a "Normal dispatch" or
  "Initial dispatch" section heading; only the review-fix typed-class
  dispatch survives, and "review-fix" (or equivalent) leads the file.
- `registry-sync-passes-slice-2` — `node
  .claude/hooks/check-registry-sync.mjs` exits 0.

**Files:**
- `/Users/bostoma/team/agents/greener.md` (new)
- `/Users/bostoma/team/agents/implementer.md`
- `/Users/bostoma/team/skills/team/registry.json`
- `/Users/bostoma/team/skills/team/SKILL.md`
- `/Users/bostoma/team/skills/team-implement/SKILL.md`

**Steps:**

1. `[parallel]` Create `agents/greener.md`. Frontmatter mirrors
   `agents/implementer.md` lines 1-7 shape: `name: greener`,
   `description: ...`, `model: opus`, `tools: ...`, `permissionMode:
   acceptEdits`. Body sections:
   - `## Responsibilities` — "Dispatched per slice AFTER test-architect
     has produced a clean red. Write the minimum implementation that
     turns the slice's failing acceptance tests green. May add/modify/
     remove step-level unit tests internally (per
     `skills/test-first-development/SKILL.md:78-99` two-level model).
     Cannot refactor existing code, cannot add abstractions beyond what
     a test exercises, cannot extend scope."
   - `## Inputs` — `plan.md`, `structure.md`, slice spec, the failing
     tests test-architect just wrote.
   - `## Scope fence` — copy the wording shape from
     `agents/implementer.md:145-153` ("Do NOT modify acceptance tests
     written by test-architect; do NOT add slices beyond the plan; do
     NOT opportunistically refactor existing code — that is the
     refactorer's job").
   - `## Commit` — "One commit per slice using `feat: <slice>` as the
     subject (one commit per `[repo: <slug>]` group when multi-repo)."
   - `## Report` — return `{slice, testsPassing, commits}` matching
     `agents/implementer.md:116-119` shape.

2. `[parallel]` Restructure `agents/implementer.md`. Remove the
   `### Initial dispatch` section (lines 22-37) and the
   `## Slice-by-slice execution` section (lines 91-119) and the
   `## TDD discipline within each slice` section (lines 125-133),
   plus the `## Working with existing code` section (lines 178-195)
   — those concerns migrate to greener/refactorer. Keep the
   `### Review-fix dispatch (after a hard-gate failure)` block and
   `### Common to all fix dispatches`. Rewrite the file's opening so
   "review-fix" or "fix dispatch" leads (replaces lines 9-21
   responsibilities). Keep `## Scope fence`, `## Code quality`,
   `## Handle blockers`, `## Completion` / `## Implementation
   Complete` sections — they apply to the review-fix dispatch too.
   Update the `## Per-slice progress reporting` section to be a
   review-fix progress report (or remove if redundant with `Common
   to all fix dispatches`).

3. `[parallel]` `skills/team/registry.json` — Add a new agent entry
   in the `agents` array (after the `test-architect` entry, before
   the reviewers): `{"name": "greener", "phase": "IMPLEMENT"}` (no
   `parallel` key — greener is sequential within IMPLEMENT per
   design Decision 2 and research Q11 schema). Update the `gates`
   array: add `{"after": "greener", "type": "mechanical",
   "condition": "all current-slice acceptance tests pass and prior
   slices still pass", "maxRetries": 3}` between the existing
   `after: test-architect` mechanical gate and the `after: 5
   reviewers` aggregate gate.

4. `[parallel]` `skills/team/SKILL.md` — Update the IMPLEMENT phase
   table row at line 95 from `test-architect, implementer, 5
   reviewers (parallel)` to `test-architect (per slice), greener (per
   slice), 5 reviewers (parallel)`. (refactorer added in Slice 3.)
   Update the inventory-count prose at line 38-39 ("lists the 13
   specialist agents") to "14 specialist agents" — Slice 3 will bump
   it to 15. Update the per-phase agent list at lines 232-247 to add
   `greener` to the IMPLEMENT row.

5. `[sequential after 1-4]` `skills/team-implement/SKILL.md` — In
   `## Execution`, rewrite the per-slice loop body from Slice 1 to:
   "for each slice: dispatch `test-architect` → mechanical red gate
   → dispatch `greener` → **mechanical green gate** → next slice".
   Add the mechanical green gate sub-step explicitly: run suite,
   advance only if current-slice acceptance tests pass AND prior
   slices' tests still pass; on failure re-dispatch greener with the
   typed `green failed` class and the failing-test names; cap at **3
   attempts per slice**; escalate at cap (per design Decision 5 and
   structure Slice 2 Tests). Update the TodoWrite seed (line 36-37)
   to `Test-architect (per slice) → Red gate → Greener (per slice)
   → Green gate → Review round 1`. Update the ASCII `## Quality
   Loop` diagram accordingly. Step 7's "re-dispatch implementer with
   the typed class" stays the same — review-fix still dispatches
   `implementer` per design Decision 2.

**Verification:** `test -f /Users/bostoma/team/agents/greener.md`;
grep `registry.json` for `"greener"`; grep `skills/team/SKILL.md`
phase table for `greener`; grep `skills/team-implement/SKILL.md` for
`green gate` and `3 attempts`; grep `agents/implementer.md` confirms
`Normal dispatch` / `Initial dispatch` absent and `review-fix` leads;
run `node .claude/hooks/check-registry-sync.mjs` and confirm exit 0.

**Commit:** `feat(greener): add green-step agent, mechanical green gate, retire implementer from normal dispatch`

### Slice 3: introduce refactorer and complete the trio

**Acceptance tests** (from structure.md):
- `refactorer-agent-file-exists` — `test -f agents/refactorer.md`
  succeeds.
- `refactorer-frontmatter-complete` — grep `agents/refactorer.md` for
  all five required frontmatter fields.
- `refactorer-runs-only-on-green` — grep `agents/refactorer.md`
  Responsibilities for the explicit "only runs on green" precondition.
- `refactorer-reruns-tests-each-change` — grep `agents/refactorer.md`
  for the "re-run tests after each structural change" rule (per
  `skills/refactoring-to-patterns/SKILL.md:158-168`).
- `refactorer-noop-on-failure` — grep `agents/refactorer.md` for the
  revert-and-report-no-op contract when refactoring breaks a
  previously-green test (per design Decision 6).
- `refactorer-in-registry` — grep `skills/team/registry.json` for a
  `"refactorer"` entry with `"phase": "IMPLEMENT"` and no
  `"parallel": true`.
- `refactorer-in-phase-table` — grep `skills/team/SKILL.md` IMPLEMENT
  row for both `greener` and `refactorer` in order.
- `trio-loop-documented` — grep `skills/team-implement/SKILL.md`
  Execution section for the full trio loop and the note that the
  refactorer's commit is optional (no-op produces no commit).
- `agent-count-updated` — grep `AGENTS.md` for `Agents (15)` (was 13).
- `architecture-agent-count-updated` — grep `docs/architecture.md`
  for the updated `15 specialist agents` / `15 specialist agents,
  organized by phase` wording (was 13).
- `registry-sync-passes-slice-3` — `node
  .claude/hooks/check-registry-sync.mjs` exits 0.

**Files:**
- `/Users/bostoma/team/agents/refactorer.md` (new)
- `/Users/bostoma/team/skills/team/registry.json`
- `/Users/bostoma/team/skills/team/SKILL.md`
- `/Users/bostoma/team/skills/team-implement/SKILL.md`
- `/Users/bostoma/team/AGENTS.md`
- `/Users/bostoma/team/CLAUDE.md` (symlink to AGENTS.md — only edit
  if `readlink AGENTS.md`/`CLAUDE.md` reveals they are separate
  files; otherwise the AGENTS.md edit covers both)
- `/Users/bostoma/team/docs/architecture.md`

**Steps:**

1. `[parallel]` Create `agents/refactorer.md`. Frontmatter:
   `name: refactorer`, `description: ...`, `model: opus`, `tools: ...`,
   `permissionMode: acceptEdits`. Body sections:
   - `## Responsibilities` — "Dispatched per slice AFTER the
     mechanical green gate passes. Loads
     `skills/refactoring-to-patterns/SKILL.md`. (a) Only runs on
     green: the agent verifies all tests pass before starting and
     refuses to start otherwise. (b) Performs the smallest structural
     change at a time and re-runs the full test suite after each
     change (per `skills/refactoring-to-patterns/SKILL.md:158-168`).
     (c) Refactor only what the slice touched (per
     `skills/refactoring-to-patterns/SKILL.md:172-185`). (d) If at
     any point a test goes red the agent MUST revert its changes and
     report `no-op` — committing on red is forbidden. (e) If no
     refactoring opportunity exists, report `no-op` and produce no
     commit."
   - `## Inputs` — `plan.md`, `structure.md`, slice spec, the green
     test suite.
   - `## Scope fence` — "No behavior change; no scope extension; no
     touching code outside the slice; no committing on red."
   - `## Commit` — "When refactoring is performed: one commit per
     slice using `refactor: <slice> (<smell> → <pattern>)` as the
     subject (one commit per `[repo: <slug>]` group when multi-repo;
     per design Decision 4 and `skills/refactoring-to-patterns/
     SKILL.md:172-185`). When no-op: no commit; report `no-op` to
     orchestrator."
   - `## Report` — `{slice, testsPassing, commits}` matching
     existing shape; `commits` may be an empty list on no-op.

2. `[parallel]` `skills/team/registry.json` — Add a new agent entry
   in the `agents` array after the `greener` entry (added in Slice 2):
   `{"name": "refactorer", "phase": "IMPLEMENT"}` (no `parallel`).
   Per design Decision 6, do NOT add a second mechanical gate entry
   in `gates` — refactorer self-verifies.

3. `[parallel]` `skills/team/SKILL.md` — Update the IMPLEMENT phase
   table row at line 95 to
   `test-architect (per slice), greener (per slice), refactorer (per
   slice), 5 reviewers (parallel)`. Update the inventory-count prose
   from "14 specialist agents" (set in Slice 2) to "15 specialist
   agents". Update the per-phase agent table at lines 232-247 to add
   `refactorer` to the IMPLEMENT row. If a sequencing sentence
   describes IMPLEMENT in prose, update it to read "test-architect
   (per slice) → greener → refactorer → next slice → 5 reviewers".

4. `[parallel]` `AGENTS.md` — Update the line `## Agents (13)` at
   line 56 to `## Agents (15)`. If `CLAUDE.md` is a separate file
   rather than a symlink to `AGENTS.md`, apply the same edit there.

5. `[parallel]` `docs/architecture.md` — Update line 232 from `13
   specialist agents, organized by phase:` to `15 specialist
   agents, organized by phase:`. Update line 38-39 from `lists the
   13 specialist agents` to `lists the 15 specialist agents`. Add
   `greener` and `refactorer` to the IMPLEMENT row at line 241.
   Update any agent-skill loadout rows in the table at lines
   317-321 to reflect that `refactoring-to-patterns` is loaded by
   `refactorer` (not implementer) and add a row for
   `refactorer`/`greener` if the table lists agents.

6. `[sequential after 1-5]` `skills/team-implement/SKILL.md` —
   Extend the per-slice loop from Slice 2: "for each slice:
   `test-architect` → red gate → `greener` → green gate →
   `refactorer` → next slice". Add an explicit note: "The
   refactorer's commit is optional — when the agent reports `no-op`
   no commit is produced and the orchestrator records `refactor
   skipped (no smells)` in TodoWrite before advancing." (Covers
   design Edge case "slice with zero refactoring opportunities" and
   Decision 6.) Update the TodoWrite seed to `Test-architect (per
   slice) → Red gate → Greener (per slice) → Green gate →
   Refactorer (per slice) → Review round 1`. Update the ASCII
   `## Quality Loop` diagram to show the full trio. Confirm the
   review-fix loop still dispatches `implementer` (unchanged from
   Slice 2).

**Verification:** `test -f /Users/bostoma/team/agents/refactorer.md`;
grep `registry.json` for `"refactorer"`; grep `skills/team/SKILL.md`
phase table for both `greener` and `refactorer`; grep `AGENTS.md`
for `Agents (15)`; grep `docs/architecture.md` for `15 specialist
agents`; run `node .claude/hooks/check-registry-sync.mjs` and
confirm exit 0. All Slice 1, 2, and 3 acceptance tests pass.

**Commit:** `feat(refactorer): add refactor-step agent with self-verification, complete R-G-R trio`

## Done Criteria

- All acceptance tests for Slices 1, 2, and 3 pass.
- `node .claude/hooks/check-registry-sync.mjs` exits 0 after the
  Slice 3 commit (final state: 15 agent files, 15 registry entries,
  phase table consistent).
- `agents/implementer.md` retains only the review-fix dispatch and
  is referenced only from `skills/team-implement/SKILL.md`'s
  hard-gate retry step (not from the normal per-slice dispatch).
- `AGENTS.md`, `docs/architecture.md`, `skills/team/SKILL.md`, and
  `skills/team/registry.json` all agree the agent count is 15 and
  the IMPLEMENT row lists `test-architect`, `greener`, `refactorer`,
  and the 5 reviewers in that order.
- No regressions: existing reviewer dispatch, aggregate gate, 5-round
  retry cap, and multi-repo semantics are unchanged.
- The structure.md "Out of structure" list remains untouched (no
  scope creep — no QRSPI changes outside IMPLEMENT, no reviewer
  changes, no `red-author` rename, no solid-principles addition,
  no second mechanical gate after refactorer).
