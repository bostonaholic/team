---
name: team-implement
description: 'Executes and verifies implementation slices. Trigger on "implement this", "execute the plan", or "/team-implement" only; never infer the phase from a ready plan.'
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team Implement — Execute the Plan

Run the IMPLEMENT phase. Three internal sub-steps:

1. **Test-first** — `test-architect` writes failing acceptance tests
2. **Slice execution** — `implementer` executes vertical slices with
   per-slice commits
3. **Code review** — 5 parallel reviewers + aggregate hard-gate retry loop

## Core contracts

- Require `7-structure.md`, `8-plan.md`, and a non-default-branch worktree. Use `AskUserQuestion` only for missing standalone setup.
- If `4-repos.md` exists, multi-repo work requires worktrees; refuse in-place execution.
- Seed TodoWrite with `Review round 1`.
- Retry as `Review round <n+1> (<b> Blocking, <m> Major open)`.
- Call the Skill tool with `review-severity-tiers` before aggregate decisions.
- Persist `### Cross-model disposition` to `cross-model-notes.md` only when it does not begin `Not run:`.
- Full pipeline: do **not** end the turn; call the Skill tool with `team-pr` in the same turn.
- **Standalone**: after success, suggest `/team-pr`.

## Procedure references

Read each reference completely when reaching that stage. Follow them in order; later stages depend on state and gates established earlier.

1. [Input](references/01-input.md)
2. [Worktree Check](references/02-worktree-check.md)
3. [Execution](references/03-execution.md)
4. [Quality Loop](references/04-quality-loop.md)
5. [Standalone Mode Tradeoffs](references/05-standalone-mode-tradeoffs.md)

## Applied principles

Load and apply: `principle-progress-tracking`.
