---
name: team-implement
description: Execute the implementation phase. Includes test-first sub-step (writing failing tests, mechanical confirmation gate) and adversarial verification (5 parallel reviewers with hard-gate retry loop). Trigger on "implement this", "execute the plan", or "/team-implement".
argument-hint: "docs/plans/<id>/"
---

# Team Implement — Execute the Plan

Run the IMPLEMENT phase. Four internal sub-steps:

1. **Test-first (per slice)** — `test-architect` is dispatched once per
   slice and writes that slice's failing acceptance tests
2. **Green-step (per slice)** — `greener` is dispatched once per slice
   and writes the minimum code that turns the slice's red tests green
3. **Refactor-step (per slice)** — `refactorer` is dispatched once per
   slice and improves structure while preserving behavior; its commit
   is **optional** (no-op produces no commit)
4. **Code review** — 5 parallel reviewers + aggregate hard-gate retry loop

Steps 1, 2, and 3 form a trio inside a per-slice loop: `test-architect
→ red gate → greener → green gate → refactorer → next slice` for each
slice in order. Step 4 runs once after every slice is done. The
review-fix loop re-dispatches the `implementer` agent (typed failure
class) when the aggregate gate fails.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`.

The agents read:

- `$ARGUMENTS/plan.md` — file-level steps and per-slice tests
- `$ARGUMENTS/structure.md` — slice ordering and verification checkpoints
- `$ARGUMENTS/design.md` — context for what each test should assert
- `$ARGUMENTS/repos.md` — repo scope (only present when the topic spans
  more than one repository); the implementer cd's between worktrees as
  the plan steps require
- `$ARGUMENTS/task.md` — intent (for the implementer when in standalone mode)

If `$ARGUMENTS/plan.md` does not exist:

- **Standalone mode** — bootstrap a minimal `$ARGUMENTS/task.md` from
  `$ARGUMENTS` (or have the user provide a description) and run the
  per-slice R-G-R trio against the single derived slice:
  `test-architect` → red gate → `greener` → green gate → `refactorer`
  (optional commit) → reviewers, all working from `task.md` alone.
  `implementer` is reserved for the aggregate-gate review-fix loop, as
  it is in normal mode.

Coordinate progress via TodoWrite. Seed: `Test-architect (per slice) →
Red gate → Greener (per slice) → Green gate → Refactorer (per slice) →
Review round 1`.

## Worktree Check

Before any agent dispatch, decide where to work:

1. **Read `$ARGUMENTS/repos.md` if present.** When present, you are in
   multi-repo mode. Confirm a worktree exists in **every** listed repo
   (read the `## Worktrees` section). If any are missing, tell the
   user to run `/team-worktree docs/plans/<id>/` and stop.
2. Run `git rev-parse --absolute-git-dir`. If the path contains
   `/worktrees/`, you are already inside a Claude Code worktree —
   proceed in place. In multi-repo mode this should be the home repo's
   worktree; the implementer cd's into the other repos' worktrees as
   the plan steps require.
3. If you are in the main working tree, use `AskUserQuestion` to ask
   where to run the implementation. Use a single question with a
   `Worktree` header and these options:
   - **Worktree (Recommended)** — isolate this implementation in a new
     git worktree (or set of worktrees in multi-repo mode).
   - **In-place** — implement on the current branch in the main working
     tree.

   - On **Worktree** — derive `<id>` from `$ARGUMENTS`, create the
     worktree(s) via `/team-worktree docs/plans/<id>/`, tell the user
     the home worktree path, and ask them to re-run
     `/team-implement docs/plans/<id>/` from that directory.
   - On **In-place** — proceed. (In-place is single-repo only — refuse
     in-place if `repos.md` is present and tell the user that
     multi-repo work requires worktrees.)

## Execution

1. **Verify** `$ARGUMENTS/plan.md` (resume mode) or bootstrap
   `$ARGUMENTS/task.md` (standalone mode).

2. **For each slice in `structure.md` (in order):**

   a. Dispatch `test-architect` **for the current slice only** →
      produces that slice's failing acceptance tests and a `test:
      <slice>` commit. In standalone mode the agent derives acceptance
      criteria from `$ARGUMENTS/task.md` instead of `structure.md`.

   b. **Mechanical red gate** — confirm the current slice's tests fail
      with assertion errors (not crashes), and that any prior slices'
      tests still pass. On crash, fix test infrastructure before
      proceeding.

      **First slice boundary:** on the first slice the prior-slices
      set is empty, so the red gate only checks the current slice's
      tests fail cleanly. There is nothing yet for the gate to
      regression-check.

   c. Dispatch `greener` for the current slice → writes the minimum
      code that turns the slice's failing acceptance tests green and
      produces a `feat: <slice>` commit (one per repo in multi-repo
      mode). In standalone mode it works from `$ARGUMENTS/task.md`
      and the slice's failing tests.

   d. **Mechanical green gate** — re-run the test suite. Advance to
      the next slice **only if** the current slice's acceptance tests
      pass **and** all prior slices' tests still pass. On failure,
      re-dispatch `greener` with the typed `green failed` class and
      the failing-test names. Cap at **3 attempts** per slice
      (`maxRetries: 3`); escalate at cap. Prior slices' tests are
      included in the gate so a regression in slice N-1 caused by
      slice N's `greener` is caught immediately.

      **First slice boundary:** on the first slice the prior-slices
      set is empty, so the green gate only checks the current slice's
      tests pass. There is nothing yet for the gate to
      regression-check.

   e. Dispatch `refactorer` for the current slice → loads
      `skills/refactoring-to-patterns/SKILL.md`, verifies the suite is
      green, performs the smallest structural change at a time, re-runs
      the full test suite after each change, and commits as
      `refactor: <slice>` (one per repo in multi-repo mode) **only if
      the suite is still green**. The refactorer's commit is
      **optional**: when there is no refactoring opportunity, or when
      the refactor cannot leave the suite green, the agent reverts its
      changes and reports `no-op`. **A no-op produces no commit.** On
      `no-op`, record "refactor skipped (no smells)" in TodoWrite and
      advance to the next slice. The refactorer self-verifies — there
      is no second mechanical gate after it (design Decision 6); a
      regression that slipped past the refactorer is caught by the
      next slice's red gate or the final aggregate reviewer gate.

   Repeat (a)–(e) until every slice has been completed. Each
   `test-architect`, `greener`, and `refactorer` dispatch is per slice
   — do not write tests, code, or refactors for slices other than the
   one in flight.

3. Dispatch 5 reviewers in parallel: `code-reviewer`,
   `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier`.
4. **Aggregate gate** — evaluate hard gates:
   - `security-review` FAIL on CRITICAL or HIGH findings
   - `verification` FAIL if any check failed or no checks detected
   - `code-review` FAIL on REQUEST CHANGES verdict
5. On hard-gate failure:
   - Record a typed failure class (security, lint, typecheck, build,
     test, review)
   - Append `Review round <n+1>` to the TodoWrite ledger
   - If round count < 5: re-dispatch implementer with the typed class,
     then re-dispatch ALL 5 reviewers for a fresh review
   - If round count ≥ 5: escalate with a full unresolved-findings summary
6. **Stop once all hard gates pass clean.** Suggest `/team-pr`.

## Quality Loop

```
for each slice:
  test-architect (per slice) → red gate → greener (per slice) → green gate
                                                                    ↓
                                          refactorer (per slice, optional commit)
                                                                    ↓
                                                       (next slice or done)
                                                                    ↓
                                              5 reviewers → aggregate gate
                                                  ↑                ↓ fail
                                                  └─ implementer (typed class)
                                                                    ↓ pass
                                                              verification clean
```

Maximum 5 rounds. Each round is a complete re-review with fresh context —
reviewers do not remember previous rounds.

## Standalone Mode Tradeoffs

Standalone mode skips the Question/Research/Design/Structure/Plan
ceremony. You forfeit blind research, human design alignment, and explicit
slice breakdown. Use it when:

- The work is well-scoped and tracked in a ticket with clear acceptance
- You have already decided the approach and want test-first execution
- The change is small enough that QRSPI artifacts would be overhead

For larger features, prefer `/team` (full pipeline) for the alignment gates.

## Completion

Present all review verdicts and tell the user:
**"Next: run `/team-pr docs/plans/<id>/`"**
