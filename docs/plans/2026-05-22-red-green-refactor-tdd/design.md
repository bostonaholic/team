---
topic: red-green-refactor-tdd
date: 2026-05-22
phase: design
approved: true
approved_at: 2026-05-22T00:00:00Z
revision: 1
---

# Design: red-green-refactor-tdd

## Current state

The IMPLEMENT phase today is a three-step pipeline coordinated by
`skills/team-implement/SKILL.md:9-14`: (1) `test-architect` writes every
failing acceptance test from `structure.md`; (2) a mechanical gate confirms
those tests fail with assertion errors, not crashes
(`skills/team/SKILL.md:165-171`); (3) `implementer` executes slices,
each ending in a single atomic commit; (4) five reviewers run in parallel
behind an aggregate hard gate (`skills/team-implement/SKILL.md:80-92`).

`agents/implementer.md` mixes three concerns inside each slice. Lines
99-115 do the "make tests pass" work (green). Lines 178-195 (`Working
with existing code`) call out a pre-feature `refactor:` commit for
existing-code cleanup. Lines 125-133 describe step-level TDD ("Do not
optimize or refactor until the slice's tests pass"), implying a private
refactor pass at the end of the slice. All three live in one agent
file, executed in one dispatch, landing in one commit. There is no
structural enforcement that "green" code cannot quietly include
refactoring, nor that refactoring runs only on green tests.

`skills/test-first-development/SKILL.md:78-99` already distinguishes
**acceptance tests** (immutable scope fence, written up-front) from
**step-level red-green-refactor** ("the developer may use traditional
TDD cycles"). The two-level model exists in the skill; the agent layer
does not enforce it.

The only intra-phase precedent for two sequential agents with a
mechanical gate between them is the existing `test-architect` →
mechanical gate → `implementer` split. This is the pattern to mirror.

## Desired end state

The IMPLEMENT phase becomes a five-step pipeline per slice:
`test-architect` (slice tests, red) → mechanical red gate → `greener`
(minimal code to pass, green) → mechanical green gate → `refactorer`
(clean up while green) → next slice. After the final slice, the five
reviewers fire as today.

`test-architect`'s responsibility is unchanged in scope (write the
acceptance tests for a slice) but its dispatch shifts to per-slice
instead of all-slices-up-front (see Decision 1). The new `greener`
agent owns only the smallest change that turns the slice's red tests
green — it cannot refactor existing code, cannot add abstractions
beyond what a test exercises, cannot extend scope. The new
`refactorer` agent runs only when all slice tests are green; its
sole job is to leave behavior identical while improving structure,
and it must re-prove tests are green before it commits.

Each slice produces up to three commits in fixed order: `test: <slice>`
(from test-architect), `feat: <slice>` (from greener), and optionally
`refactor: <slice>` (from refactorer; skipped with a no-op note when
no refactoring is warranted). The aggregate reviewer gate at the end
of IMPLEMENT is unchanged. `implementer.md` is retained only for
review-fix dispatch (the typed-failure-class loop at
`agents/implementer.md:38-89`); normal dispatch flows through the
new trio.

## Patterns to follow

- **Mechanical gate precedent.** Mirror the existing red gate
  (`skills/team/SKILL.md:165-171`, `skills/team-implement/SKILL.md:75-76`)
  for the new green gate: orchestrator runs the test suite, advances
  only if all current-slice acceptance tests pass and prior slices
  still pass; on failure, re-dispatch the prior agent.
- **Per-slice commit and report contract.** Keep the
  `{slice, testsPassing, commits}` shape from
  `agents/implementer.md:116-119`. Each agent in the trio returns
  its own one-commit report; the orchestrator aggregates them.
- **Test-first two-level model.** Honor
  `skills/test-first-development/SKILL.md:78-99` — acceptance tests
  are the scope fence (written by test-architect, immutable),
  step-level unit tests are implementation detail (owned by greener,
  freely added/modified/removed inside its dispatch).
- **Refactoring discipline.** `refactorer` follows
  `skills/refactoring-to-patterns/SKILL.md:12-30, 157-185` verbatim:
  refactor only on green, smallest change first, run tests after each
  change, commit when green, name the smell in the commit message.
- **Agent introduction protocol.** Add `agents/greener.md` and
  `agents/refactorer.md` alongside entries in
  `skills/team/registry.json` and the phase table in
  `skills/team/SKILL.md:85-96`, atomically per
  `skills/team/SKILL.md:238-240`. The dev hook
  `.claude/hooks/check-registry-sync.mjs` will enforce sync.

## Decisions made

1. **Granularity: per slice, with step-level TDD encapsulated inside
   greener.** test-architect writes the slice's acceptance tests
   (red, slice-scoped). greener may run private internal red-green-
   refactor cycles using unit tests to build up the implementation,
   but those step-level tests are implementation detail and the
   structural cycle the orchestrator sees is one R-G-R per slice.
   *Alternative considered:* per-acceptance-test cycles — rejected
   because it multiplies orchestration overhead and breaks the
   "write all failing tests per slice up-front" invariant test-architect
   already enforces.
   *Alternative considered:* one big R-G-R for the whole feature —
   rejected because it loses the per-slice mechanical gate that
   already catches incremental drift.

2. **Topology: keep `test-architect`; add `greener` and `refactorer`;
   retire `implementer` from normal dispatch.** `test-architect`
   already plays "red" cleanly. The new pair owns green and refactor
   in dedicated agent files. `implementer.md` stays on disk to handle
   the review-fix dispatch (typed failure classes); its normal-dispatch
   section is removed.
   *Alternative considered:* rename `test-architect` to `red-author`
   for trio symmetry — rejected as a cosmetic change with churn cost
   greater than the clarity benefit. The trio remains
   `test-architect → greener → refactorer` and we accept the
   naming asymmetry.
   *Alternative considered:* delete `implementer.md` entirely and
   route review-fix to `greener` — rejected because review-fix work
   spans security/lint/typecheck/build/test/review categories that
   are not "make a failing test pass"; the existing typed-class
   handler in `agents/implementer.md:38-89` is the right shape.

3. **Per-slice dispatch of test-architect.** Today test-architect
   writes every slice's tests in one dispatch up-front. Under R-G-R,
   it is re-dispatched per slice so the test → green → refactor
   triplet lives wholly within one slice's boundary. This makes the
   commit triplet trivial (each agent commits its own slice work) and
   keeps the mechanical gates slice-scoped.
   *Alternative considered:* leave test-architect as one upfront
   dispatch and have greener/refactorer reach into a pre-written
   bucket of tests per slice — rejected because it puts the red
   commit far away from its matching green/refactor commits in
   history and makes "tests for slice N fail cleanly" hard to
   re-verify after slice N-1 lands code.

4. **Commit discipline: three commits per slice, in order.**
   `test: <slice>` from test-architect, `feat: <slice>` from greener,
   `refactor: <slice>` from refactorer (optional — skipped when the
   refactorer has nothing to clean up; the agent reports "no-op" and
   no commit is made). Multi-repo mode produces one commit per
   `[repo: <slug>]` step in the slice per agent, mirroring the
   current per-repo commit shape (`agents/implementer.md:109-115`).
   *Alternative considered:* keep one squashed commit per slice —
   rejected because it erases exactly the history the user is asking
   to surface.

5. **Mechanical green gate after greener.** Orchestrator runs the
   test suite when greener returns; advances to refactorer only if
   every current-slice acceptance test passes and all prior slices'
   tests still pass. On failure: re-dispatch greener with the failing
   test output (a typed "green failed" class). Mirrors the existing
   red gate exactly.
   *Alternative considered:* let refactorer run tests itself first —
   rejected because the gate then sits inside the agent whose work
   it does not gate, which is the opposite of single responsibility.

6. **Refactorer self-verification before commit.** refactorer
   re-runs the full test suite after each structural change per
   `skills/refactoring-to-patterns/SKILL.md:158-168`. It is forbidden
   from committing if any test is red. If refactorer cannot leave
   green it must revert its changes and report "no-op".
   *Alternative considered:* second mechanical gate after refactorer —
   rejected as redundant; the next slice's red gate (and the final
   aggregate reviewer gate) catch any regression. We accept the
   slightly weaker structural guarantee in exchange for less
   orchestration overhead.

7. **scope fence on greener.** greener inherits today's implementer
   fence (`agents/implementer.md:145-153`): no modifying acceptance
   tests, no slices beyond the plan, no opportunistic refactoring of
   existing code. The "refactor only what you touch" guidance moves
   wholesale to refactorer.

## Out of scope

- Changing the QRSPI phases outside IMPLEMENT (no impact on
  questioner, researcher, design-author, structure-planner, planner,
  worktree, PR phases).
- Changing the five-reviewer aggregate gate or its 5-round retry cap
  (`skills/team/SKILL.md:173-188`).
- Reworking `implementer.md`'s review-fix dispatch logic — it stays
  exactly as is for the typed failure classes
  (`agents/implementer.md:38-89`).
- Modifying the test-first-development skill's two-level model —
  this design honors it, doesn't change it.
- Multi-repo semantics — `[repo: <slug>]` annotations and per-repo
  commits continue to work; each new agent inherits the multi-repo
  logic from today's implementer.

## Edge cases

- **Boundary — slice with zero refactoring opportunities:**
  refactorer reports `no-op` and produces no commit; orchestrator
  records "refactor skipped (no smells)" in TodoWrite and advances.
- **Boundary — first slice with no prior slices:** green gate only
  checks current slice's tests; "prior slices still pass" set is
  empty.
- **Invalid — test-architect produces a red test that crashes:** red
  gate fails as today; orchestrator re-dispatches test-architect to
  fix infrastructure before greener is dispatched.
- **Invalid — greener writes code unrelated to any failing test:**
  not structurally preventable, but `greener.md`'s scope fence
  declares it grounds for the aggregate code-reviewer to flag.
  Treated as a code-review failure in the existing aggregate gate.
- **Failure — green gate fails (a slice test still red after
  greener):** orchestrator re-dispatches greener with the typed
  "green failed" class and the failing-test names. Cap at 3 attempts
  per slice (mirrors the spirit of the 5-round aggregate cap but
  tighter, because each round here is just "fix one slice").
  Escalate on cap.
- **Failure — refactorer breaks a previously-green test:** refactorer
  reverts its own changes per its self-verification rule, reports
  `no-op`, and the slice advances with only `test:` and `feat:`
  commits.
- **Concurrency — parallel slice execution:** out of scope. Slices
  run sequentially today and stay sequential. The trio runs
  sequentially within a slice.
- **Resource — slice with very large refactor surface:** refactorer
  is bound by "refactor only what you touch"
  (`skills/refactoring-to-patterns/SKILL.md:172-185`); large-surface
  cleanups belong in a separate ticket, not this slice.
- **Auth/registry — agent file added without registry entry:**
  the dev hook `.claude/hooks/check-registry-sync.mjs:54-113` warns
  on mismatch; this design requires `agents/greener.md`,
  `agents/refactorer.md`, and matching `skills/team/registry.json`
  entries in the same commit as the phase-table update in
  `skills/team/SKILL.md:85-96`.

## Open questions (deferred)

- Should the green gate's per-slice retry cap be 3 (proposed) or
  reuse the 5-round aggregate cap? Defer to implementation; either
  value is mechanical and easy to change.
- Should refactorer have access to `skills/solid-principles/SKILL.md`
  in addition to `skills/refactoring-to-patterns/SKILL.md`? Defer;
  the answer is probably yes but it's a one-line tools/skills change
  rather than an architectural decision.
- Naming asymmetry (`test-architect` vs `greener`/`refactorer`) is
  accepted for now. If the user later wants trio symmetry, the
  rename to `red-author` is a small follow-up.

## Risks

- **History pollution risk.** Three commits per slice triples commit
  count in a feature branch. Mitigated by clear `test:`/`feat:`/
  `refactor:` prefixes; PR reviewers can collapse on prefix.
- **Test-architect re-dispatch overhead.** Per-slice dispatch costs
  more agent rounds than today's single up-front dispatch. Mitigated
  by the fact that each slice's test list is already isolated in
  `structure.md`; re-dispatch context is small.
- **Greener might smuggle refactoring.** No structural prevention
  beyond scope-fence text. The aggregate code-reviewer is the
  backstop; the design accepts this same level of enforcement as
  today's implementer scope fence.
- **Backward compatibility of `implementer.md`.** Splitting normal
  dispatch off while keeping review-fix risks a confusing agent
  file. Mitigated by restructuring `implementer.md` to lead with the
  review-fix dispatch sections and clearly mark normal-dispatch as
  removed.
- **Documentation churn.** `skills/team/SKILL.md`,
  `skills/team-implement/SKILL.md`, `skills/team/registry.json`,
  `agents/implementer.md`, two new agent files, and likely
  `docs/architecture.md` all change in one slice. Routine for a
  pipeline change but worth calling out.
