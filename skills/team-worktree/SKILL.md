---
name: team-worktree
description: Prepare an isolated git worktree. Router action — no agent. Trigger on "set up the worktree", "isolate this work", or "/team-worktree".
---

# TEAM Worktree — Standalone Phase

Create an isolated worktree for a topic. Two modes:

- **Resume mode** — a plan artifact exists. Create the worktree; the
  next phase (Implement) is detectable by the worktree's existence on
  the topic branch (`git worktree list --porcelain`).
- **Standalone mode** — no plan, just a topic name (or ticket ID, or
  description). Create the worktree and stop, without running the rest
  of the pipeline.

## Input

`$ARGUMENTS` may be:

- Empty — resume mode. Requires an existing plan on disk.
- A ticket ID — derive topic from the issue title.
- Free-form text — derive a kebab-case topic from it.

## Execution

1. **If we are already inside a worktree** (`git rev-parse --absolute-git-dir`
   contains `/worktrees/`), report that and stop. Do not nest worktrees.
2. **Resume mode** — stat `docs/plans/<today>-<topic>-plan.md`. If
   present: create the worktree (see `skills/worktree-isolation/SKILL.md`)
   and stop. The Implement phase is detectable by future invocations via
   `git worktree list --porcelain`.
3. **Standalone mode** — `$ARGUMENTS` is non-empty and no plan exists:
   - Derive `topic` from the input (or ticket title).
   - Create the worktree using Claude Code's native worktree support.
   - Report the worktree path and suggest: "cd to <path> and run
     /team-implement <id-or-description> to start coding, or /team
     <description> for the full pipeline."
4. **Standalone with no input** — ask the user for a topic name or
   description and stop if still empty.

## Why isolate

Implementation work touches the working tree. A worktree gives the implementer
a clean, isolated checkout per topic, so concurrent pipelines do not interfere.
For trivial single-file changes, in-place implementation is allowed — no
worktree creation needed.

## Completion

Report the worktree path and the suggested next command.
