---
name: team-worktree
description: Prepare an isolated git worktree for the implementation. Router action — no agent. Trigger on "set up the worktree", "isolate this work", or "/team-worktree".
---

# TEAM Worktree — Standalone Phase

Run the WORKTREE phase. Requires a plan artifact on disk.

## Execution

1. Stat `docs/plans/<today>-<topic>-plan.md`. If missing, report "No
   plan drafted. Run /team-plan first." and stop.
2. Use Claude Code's native worktree support to create an isolated worktree
   for this topic. See `skills/worktree-isolation/SKILL.md` for the full
   methodology.
3. `writeState(topic, { phase: 'IMPLEMENT', worktreePath, branch })` so
   downstream phases know the worktree is ready. `worktreePath` and
   `branch` are optional observability fields.
4. **Stop once `state.json.phase === 'IMPLEMENT'`.**

## Why isolate

Implementation work touches the working tree. A worktree gives the implementer
a clean, isolated checkout per topic, so concurrent pipelines do not interfere.
For trivial single-file changes, in-place implementation is allowed — record
`isolation: "in-place"` in `state.json`.

## Completion

Report the worktree path and suggest: "/team-implement to start writing code"
