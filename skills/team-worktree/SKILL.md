---
name: team-worktree
description: 'Prepares isolated git worktrees. Trigger on "set up the worktree", "isolate this work", or "/team-worktree" only; never infer the phase from work needing isolation.'
effort: low
argument-hint: "[docs/plans/<id>/]"
---

# Team Worktree — Isolate the Implementation

Create a git worktree per involved repository so implementation happens on
isolated branches without affecting any main working tree. In single-repo
mode (the default) this is one worktree in the home repo. In multi-repo
mode (when `docs/plans/<id>/4-repos.md` is present) it is one worktree per
listed repo, all sharing the same `<id>` branch name.

## Core contracts

- Detect a linked checkout with `git rev-parse --git-dir` and `git rev-parse --git-common-dir`.
- **Non-default branch** in an existing linked checkout → skip worktree creation for this repo.
- **Default branch** → report and stop.
- In single-repo mode run `git worktree add .claude/worktrees/<branch>`.
- For every `4-repos.md` entry run `git -C <repo> worktree add .claude/worktrees/<branch>`.
- Record every created path under `## Worktrees` in `4-repos.md`.

## Procedure references

Read each reference completely when reaching that stage. Follow them in order; later stages depend on state and gates established earlier.

1. [Input](references/01-input.md)
2. [Detect mode](references/02-detect-mode.md)
3. [Detect existing worktree](references/03-detect-existing-worktree.md)
4. [Execution](references/04-execution.md)
