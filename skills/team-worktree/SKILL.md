---
name: team-worktree
description: Prepare an isolated git worktree. Router action — no agent. Trigger on "set up the worktree", "isolate this work", or "/team-worktree".
---

# TEAM Worktree — Standalone Phase

Create an isolated worktree for a topic. Two modes:

- **Resume mode** — a plan artifact exists; advance the pipeline state to
  `IMPLEMENT` after creating the worktree.
- **Standalone mode** — no plan, just a topic name (or beads ID, or
  description). Create the worktree and stop, without running the rest of
  the pipeline.

## Input

`$ARGUMENTS` may be:

- Empty — resume mode. Requires an existing plan on disk.
- A beads issue ID — derive topic from the issue title.
- Free-form text — derive a kebab-case topic from it.

## Execution

1. **If we are already inside a worktree** (`git rev-parse --absolute-git-dir`
   contains `/worktrees/`), report that and stop. Do not nest worktrees.
2. **Resume mode** — stat `docs/plans/<today>-<topic>-plan.md`. If present:
   create the worktree (see `skills/worktree-isolation/SKILL.md`),
   `writeState(topic, { phase: 'IMPLEMENT', worktreePath, branch })`, and
   stop.
3. **Standalone mode** — `$ARGUMENTS` is non-empty and no plan exists:
   - Derive `topic` from the input (or beads issue title).
   - Create the worktree using Claude Code's native worktree support.
   - If state.json does not exist, do not bootstrap one — the user can
     start a pipeline from inside the worktree later.
   - Report the worktree path and suggest: "cd to <path> and run
     /team-implement <id-or-description> to start coding, or /team
     <description> for the full pipeline."
4. **Standalone with no input** — ask the user for a topic name or
   description and stop if still empty.

## Why isolate

Implementation work touches the working tree. A worktree gives the implementer
a clean, isolated checkout per topic, so concurrent pipelines do not interfere.
For trivial single-file changes, in-place implementation is allowed — record
`isolation: "in-place"` in `state.json`.

## Completion

Report the worktree path and the suggested next command.
