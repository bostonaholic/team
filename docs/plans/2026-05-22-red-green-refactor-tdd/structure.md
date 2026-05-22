---
topic: red-green-refactor-tdd
date: 2026-05-22
phase: structure
approved: true
approved_at: 2026-05-22T00:00:00Z
revision: 1
---

# Structure: red-green-refactor-tdd

This change reshapes the IMPLEMENT phase from `test-architect → implementer →
reviewers` into `test-architect (per-slice) → greener → refactorer → next
slice → 5 reviewers`. Because this is a pipeline/orchestrator change, the
"user-visible behavior" each slice ships is observable in the agent and skill
files themselves: an end user running `/team` after slice N lands sees the
phase table, agent set, and dispatch sequence reflect the new shape.

The registry-sync invariant (`.claude/hooks/check-registry-sync.mjs`) couples
each new agent file to its `skills/team/registry.json` entry; the SKILL.md
phase table must also stay in sync. Every slice that adds or restructures
an agent therefore touches all three files atomically.

## Slices

### Slice 1: test-architect goes per-slice
**Goal:** Restructure `test-architect` so it writes only the current slice's
failing acceptance tests (its `test:` commit), and update `team-implement`
to dispatch it per-slice. No new agents yet; pipeline shape after this
slice is `test-architect (per-slice) → red gate → implementer → reviewers`.
**Layers touched:** agent definition (`agents/test-architect.md`),
sub-pipeline skill (`skills/team-implement/SKILL.md`).
**Tests:**
- `agents/test-architect.md` Responsibilities section explicitly states
  per-slice dispatch and emits a `test: <slice>` commit; the prior
  "writes every acceptance test from `structure.md`" wording is gone
  (covers design Decision 3 and Edge case "test-architect produces a
  red test that crashes" — re-dispatched per slice).
- `skills/team-implement/SKILL.md` `## Execution` documents a per-slice
  loop that dispatches `test-architect` for each slice (boundary: first
  slice has no prior slices — green gate's "prior slices still pass" set
  is empty).
- Registry-sync hook still passes (`node .claude/hooks/check-registry-sync.mjs`
  exits 0) — invariant edge case from design's Auth/registry edge.

**Verification checkpoint:** Read `agents/test-architect.md` and confirm
"per slice" appears in its Responsibilities. Read `skills/team-implement/SKILL.md`
Execution section and confirm the dispatch loop is per-slice. Run the
dev hook against the unchanged registry — passes because no agents added
or removed.
**Atomic commit message:** `refactor(test-architect): dispatch per slice, scope writes to current slice's tests`

### Slice 2: introduce greener and the mechanical green gate
**Goal:** Add the `greener` agent that owns "minimum code to turn slice's
red tests green," wire it into the phase table and team-implement skill,
add the mechanical green gate after it, and retire `implementer` from
normal dispatch (keeping only its review-fix typed-class section).
After this slice, the live pipeline is
`test-architect (per-slice) → red gate → greener → green gate → reviewers`,
with the trio not yet complete.
**Layers touched:** new agent (`agents/greener.md`), inventory
(`skills/team/registry.json`), phase table (`skills/team/SKILL.md`),
sub-pipeline skill (`skills/team-implement/SKILL.md`), restructured
agent (`agents/implementer.md`).
**Tests:**
- `agents/greener.md` exists with required frontmatter (`name`,
  `description`, `model`, `tools`, `permissionMode`) and a scope-fence
  section forbidding refactoring/abstraction beyond a failing test
  (covers design Decision 7 and Edge case "greener writes code unrelated
  to any failing test").
- `skills/team/registry.json` contains a `greener` entry with
  `phase: IMPLEMENT` and no `parallel: true` (greener is sequential
  within IMPLEMENT — design Decision 2; matches research Q11 schema).
- `skills/team/SKILL.md` phase table row for IMPLEMENT lists `greener`
  between `test-architect` and the reviewers.
- `skills/team-implement/SKILL.md` documents the mechanical green gate
  exactly: run suite, advance only if current-slice acceptance tests
  pass and prior-slice tests still pass; on failure re-dispatch greener
  with the typed "green failed" class; cap at 3 attempts per slice
  (covers design Decision 5 and Edge cases "green gate fails" and
  "first slice with no prior slices").
- `agents/implementer.md` no longer contains a "Normal Dispatch" /
  per-slice green section; its surviving content is only the review-fix
  typed-class dispatch (covers design Decision 2 and Risk "backward
  compatibility of `implementer.md`"). The phrase "review-fix" or
  equivalent leads the file.
- Registry-sync hook passes: `agents/greener.md` matches the new registry
  entry (`node .claude/hooks/check-registry-sync.mjs` exits 0; covers
  Auth/registry edge case).

**Verification checkpoint:** `ls agents/greener.md` exists. Grep
`skills/team/registry.json` for `"greener"` — found, with
`"phase": "IMPLEMENT"` and no `parallel`. Grep
`skills/team-implement/SKILL.md` for "green gate" and "3 attempts" —
both present. Grep `agents/implementer.md` for "Normal dispatch" —
absent. Hook script exits 0.
**Atomic commit message:** `feat(greener): add green-step agent, mechanical green gate, retire implementer from normal dispatch`

### Slice 3: introduce refactorer and complete the trio
**Goal:** Add the `refactorer` agent with self-verification semantics,
wire it after the green gate, document the no-op-on-failure behavior,
and update the agent-count callouts in `AGENTS.md` and
`docs/architecture.md`. After this slice, the pipeline is the full
target shape: `test-architect (per-slice) → red gate → greener →
green gate → refactorer → next slice → 5 reviewers`.
**Layers touched:** new agent (`agents/refactorer.md`), inventory
(`skills/team/registry.json`), phase table (`skills/team/SKILL.md`),
sub-pipeline skill (`skills/team-implement/SKILL.md`), router
(`AGENTS.md` and the symlinked `CLAUDE.md` if applicable),
architecture doc (`docs/architecture.md`).
**Tests:**
- `agents/refactorer.md` exists with required frontmatter and a
  Responsibilities section that (a) declares the agent only runs on
  green, (b) requires re-running tests after each structural change
  per `skills/refactoring-to-patterns/SKILL.md`, (c) forbids commit
  on red and prescribes revert + "no-op" report (covers design
  Decisions 6 and 7 and Edge cases "refactorer breaks a previously-green
  test" and "slice with zero refactoring opportunities").
- `skills/team/registry.json` contains a `refactorer` entry with
  `phase: IMPLEMENT` and no `parallel: true`.
- `skills/team/SKILL.md` phase table row for IMPLEMENT now reads
  `test-architect (per-slice), greener, refactorer, 5 reviewers (parallel)`
  in that order; surrounding prose describes the per-slice trio loop
  and the sequence "test-architect (per-slice) → greener → refactorer
  → next slice → 5 reviewers" from the dispatch directive.
- `skills/team-implement/SKILL.md` Execution section documents the full
  trio loop and notes that the refactorer's commit is optional (`no-op`
  produces no commit).
- `AGENTS.md` agent-count heading and `docs/architecture.md` agent
  inventory reflect the new count (currently 13 agents on disk; after
  greener + refactorer the count is 15 — see Cross-slice concerns
  re: the design's "13 → 14" wording).
- Registry-sync hook passes.

**Verification checkpoint:** `ls agents/refactorer.md` exists. Grep
`registry.json` for `"refactorer"`. Grep `skills/team/SKILL.md` for
the new IMPLEMENT row containing both `greener` and `refactorer`. Grep
`AGENTS.md` for the updated agent count. Hook script exits 0.
**Atomic commit message:** `feat(refactorer): add refactor-step agent with self-verification, complete R-G-R trio`

## Cross-slice concerns

- **Registry-sync invariant.** Each slice that adds an agent file must
  land the `agents/<name>.md` file, its `skills/team/registry.json`
  entry, and any `skills/team/SKILL.md` phase-table reference in the
  same commit, or the dev hook
  (`.claude/hooks/check-registry-sync.mjs`) emits warnings. Slice 2
  introduces `greener` together with its registry entry and phase-table
  mention; Slice 3 does the same for `refactorer`. Pulled into both
  slices, not deferred.
- **Phase-table prose mentions of agent count.** `AGENTS.md` says
  "Agents (13)" today. The design directive says "agent count (was 13,
  becomes 14)" — but adding two new agents takes the count from 13 to
  15. The planner should treat 15 as the correct post-change count
  and flag the design's "14" as a transcription error during planning.
  Updated in Slice 3 with the rest of the doc churn.
- **Skill cross-references.** `skills/team-implement/SKILL.md`'s
  TodoWrite seed (`Test-architect → Mechanical gate → Implementer
  (per slice) → Review round 1`) becomes
  `Test-architect (per slice) → Red gate → Greener → Green gate →
  Refactorer → Review round 1` in incremental steps across Slices 1–3.
  Each slice updates the seed to the shape that matches that slice's
  pipeline; final shape lands with Slice 3.
- **Commit-discipline contract.** Each slice's agent commit pattern
  (`test:`, `feat:`, optional `refactor:` per slice; one commit per
  repo in multi-repo mode) is documented as soon as the corresponding
  agent lands — `test:` in Slice 1, `feat:` (from greener) in Slice 2,
  `refactor:` (from refactorer) in Slice 3. The multi-repo behavior
  inherits from today's implementer per design's Out-of-scope
  declaration.

## Out of structure

These design "Out of scope" items are restated here so the planner does
not include them:

- Changes to QRSPI phases outside IMPLEMENT (questioner, researcher,
  design-author, structure-planner, planner, worktree, PR are
  untouched).
- Changes to the 5-reviewer aggregate gate or its 5-round retry cap.
- Reworking `implementer.md`'s review-fix typed-class dispatch logic
  beyond removing the normal-dispatch sections; the review-fix body
  stays verbatim.
- Modifying the test-first-development skill's two-level model.
- Changes to multi-repo dispatch semantics (`[repo: <slug>]`
  annotations, per-repo commits) — the new agents inherit existing
  multi-repo logic.
- Renaming `test-architect` to `red-author` for trio symmetry — design
  Decision 2 explicitly rejected this.
- Adding `skills/solid-principles/SKILL.md` to refactorer's skill list
  (design's deferred open question).
- A second mechanical gate after refactorer — rejected in design
  Decision 6.
