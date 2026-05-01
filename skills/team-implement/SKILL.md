---
name: team-implement
description: Execute the implementation phase. Includes test-first sub-step (writing failing tests, mechanical confirmation gate) and adversarial verification (5 parallel reviewers with hard-gate retry loop). Trigger on "implement this", "execute the plan", or "/team-implement".
argument-hint: "docs/plans/<id>/"
---

# TEAM Implement — Execute the Plan

Run the IMPLEMENT phase. Three internal sub-steps:

1. **Test-first** — `test-architect` writes failing acceptance tests
2. **Slice execution** — `implementer` executes vertical slices with
   per-slice commits
3. **Code review** — 5 parallel reviewers + aggregate hard-gate retry loop

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`.

The agents read:

- `$ARGUMENTS/plan.md` — file-level steps and per-slice tests
- `$ARGUMENTS/structure.md` — slice ordering and verification checkpoints
- `$ARGUMENTS/design.md` — context for what each test should assert
- `$ARGUMENTS/task.md` — intent (for the implementer when in standalone mode)

If `$ARGUMENTS/plan.md` does not exist:

- **Standalone mode** — bootstrap a minimal `$ARGUMENTS/task.md` from
  `$ARGUMENTS` (or have the user provide a description) and run
  `test-architect` → `implementer` → reviewers from `task.md` alone.

Coordinate progress via TodoWrite. Seed: `Test-architect → Mechanical
gate → Implementer (per slice) → Review round 1`.

## Worktree Check

Before any agent dispatch, decide where to work:

1. Run `git rev-parse --absolute-git-dir`. If the path contains
   `/worktrees/`, you are already inside a Claude Code worktree — proceed
   in place.
2. If you are in the main working tree, ask: "You are not in a worktree.
   Run this implementation in a new isolated worktree (recommended), or
   in the current tree?"
   - **Worktree** — derive `<id>` from `$ARGUMENTS`, create a worktree
     via Claude Code's native support (see
     `skills/worktree-isolation/SKILL.md`), tell the user the path, and
     ask them to re-run `/team-implement docs/plans/<id>/` from that
     directory.
   - **In-place** — proceed.

## Execution

1. **Verify** `$ARGUMENTS/plan.md` (resume mode) or bootstrap
   `$ARGUMENTS/task.md` (standalone mode).
2. Dispatch `test-architect` → produces failing tests. In standalone
   mode it derives acceptance criteria from `$ARGUMENTS/task.md` instead
   of `structure.md`.
3. **Mechanical gate** — confirm all tests fail with assertion errors
   (not crashes). On crash, fix test infrastructure before proceeding.
4. Dispatch `implementer` → executes slices with per-slice commits. In
   standalone mode it works from `$ARGUMENTS/task.md` and the failing
   tests.
5. Dispatch 5 reviewers in parallel: `code-reviewer`,
   `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier`.
6. **Aggregate gate** — evaluate hard gates:
   - `security-review` FAIL on CRITICAL or HIGH findings
   - `verification` FAIL if any check failed or no checks detected
   - `code-review` FAIL on REQUEST CHANGES verdict
7. On hard-gate failure:
   - Record a typed failure class (security, lint, typecheck, build,
     test, review)
   - Append `Review round <n+1>` to the TodoWrite ledger
   - If round count < 5: re-dispatch implementer with the typed class,
     then re-dispatch ALL 5 reviewers for a fresh review
   - If round count ≥ 5: escalate with a full unresolved-findings summary
8. **Stop once all hard gates pass clean.** Suggest `/team-pr`.

## Quality Loop

```
test-architect → mechanical gate → implementer → 5 reviewers → aggregate gate
                                       ↑                            ↓ fail
                                       └────── (specific fix) ──────┘
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
