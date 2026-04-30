---
name: team-implement
description: Execute the implementation phase. Includes test-first sub-step (writing failing tests, mechanical confirmation gate) and adversarial verification (5 parallel reviewers with hard-gate retry loop). Trigger on "implement this", "execute the plan", or "/team-implement".
---

# TEAM Implement — Standalone Phase

Run the IMPLEMENT phase. Works in two modes:

- **Resume mode** — `state.json.phase === 'IMPLEMENT'` (the WORKTREE phase
  transitioned us there) or `worktreePath` is set on the snapshot. Predecessor
  artifacts (`plan.md`, `structure.md`) are present. Behave as the full
  pipeline expects.
- **Standalone mode** — invoked directly with a beads ID or feature
  description. No upstream QRSPI artifacts required. Bootstrap minimal state
  and run test-architect → implementer → reviewers from the issue alone.

The Implement phase has three internal sub-steps:

1. **Test-first** — `test-architect` writes failing acceptance tests
2. **Slice execution** — `implementer` executes vertical slices with per-slice commits
3. **Adversarial review** — 5 parallel reviewers + aggregate hard-gate retry loop

> Events named below (`tests.written`, `hard-gate.*-failed`, etc.) are
> internal signals routed via `state.json` counters and in-memory dispatch,
> not log lines. They remain as descriptive labels for the verifier /
> reviewer output classes.

## Input

`$ARGUMENTS` may be:

- Empty — assume resume mode; require `state.json.phase === 'IMPLEMENT'`.
- A beads issue ID (e.g., `team-89z`) — resolve via `/beads:show <id>` and
  use the issue title + body as the task description. Set `beadsId`.
- Free-form text — treat as the feature/task description.

## Worktree Check

Before any agent dispatch, decide where to work:

1. Run `git rev-parse --absolute-git-dir` and inspect the path. If it
   contains `/worktrees/`, you are already inside a Claude Code worktree —
   proceed in place.
2. If you are in the main working tree:
   - Ask the user: "You are not in a worktree. Run this implementation in a
     new isolated worktree (recommended), or in the current tree?"
   - If worktree: derive a kebab-case topic from `$ARGUMENTS` (or the beads
     issue title), then create a worktree via Claude Code's native support
     (see `skills/worktree-isolation/SKILL.md`). Tell the user the path
     and ask them to re-run `/team-implement` from that directory, since
     the slash command runs in the current shell context.
   - If in-place: proceed and record `isolation: "in-place"` in `state.json`.

## Execution

1. Read `~/.team/<topic>/state.json` if a topic can be derived (from
   `$ARGUMENTS`, beads issue, or current branch).
2. **Resume path.** If `state.json` exists and `phase === 'IMPLEMENT'` (or
   `worktreePath` is set), proceed using the on-disk plan/structure as the
   work source.
3. **Standalone path.** If no `state.json` matches:
   - Derive `topic` (kebab-case from `$ARGUMENTS` or issue title) and `today`
     (`YYYY-MM-DD`).
   - Bootstrap state: `initState(topic, beadsId, today)` then
     `writeState(topic, { phase: 'IMPLEMENT', isolation: <mode> })`.
   - If no `docs/plans/<today>-<topic>-plan.md` exists, write a minimal
     `docs/plans/<today>-<topic>-task.md` from `$ARGUMENTS` (or the beads
     issue body) so downstream agents have a single source of intent.
     `test-architect` and `implementer` consume `task.md` when no plan or
     structure is present.
4. Follow the phase loop from `/team`:
   a. Dispatch `test-architect` → produces failing tests. In standalone
      mode it derives acceptance criteria from `task.md` (or the beads
      issue) instead of `structure.md`.
   b. Mechanical gate: confirm all tests fail with assertion errors.
   c. Dispatch `implementer` → executes slices with per-slice commits. In
      standalone mode it works from `task.md` and the failing tests
      instead of `plan.md`.
   d. Dispatch 5 reviewers in parallel: `code-reviewer`, `security-reviewer`,
      `technical-writer`, `ux-reviewer`, `verifier`.
   e. At the aggregate gate, evaluate hard gates (security + verifier +
      code-reviewer).
5. If any hard gate fails:
   - Record a typed failure class (security, lint, typecheck, build,
     test, review) for the implementer to address.
   - Increment `verificationRetryCount` in `state.json` via `writeState`.
   - If `verificationRetryCount < 5`: dispatch implementer to fix the
     specific findings, then re-dispatch ALL 5 reviewers for a complete
     fresh review.
   - If `verificationRetryCount >= 5`: escalate to the team lead with a
     full summary of unresolved findings across all rounds, organized
     by type. Stop and wait for direction.
6. **Stop once `state.json.phase === 'PR'` or escalation.**

## Quality Loop

Implement is a loop, not a single pass:

```
test-architect → mechanical gate → implementer → 5 reviewers → aggregate gate
                                       ↑                            ↓ fail
                                       └────── (specific fix) ──────┘
                                                                    ↓ pass
                                                              verification.passed
```

Maximum 5 review rounds before escalation. Each round is a complete re-review
with fresh context — reviewers do not remember previous rounds.

## Standalone Mode Tradeoffs

Standalone mode skips the Question/Research/Design/Structure/Plan ceremony.
You forfeit blind research, human design alignment, and explicit slice
breakdown. Use it when:

- The work is well-scoped and tracked in a beads issue with clear acceptance.
- You have already decided the approach and just want test-first execution.
- The change is small enough that the QRSPI artifacts would be overhead.

For larger features, prefer `/team` (full pipeline) for the alignment gates.

## Completion

Present all review verdicts and suggest: "/team-pr to commit and open a PR"
