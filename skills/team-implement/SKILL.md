---
name: team-implement
description: Execute the implementation phase. Includes test-first sub-step (writing failing tests, mechanical confirmation gate) and adversarial verification (5 parallel reviewers with hard-gate retry loop). Trigger on "implement this", "execute the plan", or "/team-implement".
---

# TEAM Implement — Standalone Phase

Run the IMPLEMENT phase. Works in two modes:

- **Resume mode** — predecessor artifacts (`plan.md`, `structure.md`)
  are present in `docs/plans/`. Behave as the full pipeline expects.
- **Standalone mode** — invoked directly with a beads ID or feature
  description. No upstream QRSPI artifacts required. Bootstrap a minimal
  `task.md` and run test-architect → implementer → reviewers from the
  issue alone.

The Implement phase has three internal sub-steps:

1. **Test-first** — `test-architect` writes failing acceptance tests
2. **Slice execution** — `implementer` executes vertical slices with per-slice commits
3. **Adversarial review** — 5 parallel reviewers + aggregate hard-gate retry loop

Coordinate progress via TodoWrite. Seed the ledger with: `Test-architect
→ Mechanical gate → Implementer (per slice) → Review round 1`. Mark
each item `in_progress` when you dispatch and `completed` when the
artifact lands. Append `Review round 2` (etc.) on each retry; cap at 5.

## Input

`$ARGUMENTS` may be:

- Empty — assume resume mode; require `plan.md` (or at minimum
  `structure.md`) on disk for the topic.
- A beads issue ID (e.g., `team-89z`) — resolve via `/beads:show <id>`
  and use the issue title + body as the task description. Record the
  beads ID in `task.md`'s frontmatter.
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
   - If in-place: proceed.

## Execution

1. Derive `topic` (kebab-case from `$ARGUMENTS`, beads issue title, or
   current branch) and `today` (`YYYY-MM-DD`).
2. **Resume path.** If `docs/plans/<today>-<topic>-plan.md` (or at
   minimum `structure.md`) exists, proceed using those artifacts as the
   work source.
3. **Standalone path.** If no plan/structure on disk:
   - Write a minimal `docs/plans/<today>-<topic>-task.md` from
     `$ARGUMENTS` (or the beads issue body) with the standard task.md
     frontmatter (`topic`, `date`, `phase: task`, `beadsId`). This gives
     downstream agents a single source of intent.
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
   - Append a "Review round <n+1>" item to the TodoWrite ledger and mark
     the previous round complete.
   - If round count < 5: dispatch implementer to fix the specific
     findings, then re-dispatch ALL 5 reviewers for a complete fresh
     review.
   - If round count >= 5: escalate to the user with a full summary of
     unresolved findings across all rounds, organized by type. Stop and
     wait for direction.
6. **Stop once all hard gates pass — suggest /team-pr to ship.**

## Quality Loop

Implement is a loop, not a single pass:

```
test-architect → mechanical gate → implementer → 5 reviewers → aggregate gate
                                       ↑                            ↓ fail
                                       └────── (specific fix) ──────┘
                                                                    ↓ pass
                                                              verification clean
```

Maximum 5 review rounds before escalation. Each round is a complete
re-review with fresh context — reviewers do not remember previous
rounds. Track the round count in TodoWrite.

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
