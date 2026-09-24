---
name: team-worktree
description: 'Use for isolated worktrees only on explicit request. Never infer from work needing isolation. Applies project conventions.'
effort: low
argument-hint: "[docs/plans/<id>/]"
---

# Team Worktree

Before finalizing prose you author, read the [writing standards](../team/references/writing.md).

Create one isolated git worktree per involved repo, all on branch `<id>`,
without affecting any main working tree: the home repo in single-repo mode
(the default), or every repo listed in `docs/plans/<id>/4-repos.md` when that
file exists.

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
