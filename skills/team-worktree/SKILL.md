---
name: team-worktree
description: Prepare an isolated git worktree. Router action — no agent. Trigger on "set up the worktree", "isolate this work", or "/team-worktree".
argument-hint: "docs/plans/<id>/"
---

# TEAM Worktree — Isolate the Implementation

Create a git worktree so implementation happens on an isolated branch
without affecting your main working tree.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`.

The directory's basename — `<id>` — is used as both the branch name and
the worktree directory name. If `$ARGUMENTS/plan.md` does not exist,
tell the user to run `/team-plan docs/plans/<id>/` first and stop.

## Execution

1. **Refuse to nest worktrees.** If `git rev-parse --absolute-git-dir`
   contains `/worktrees/`, report that you are already inside a worktree
   and stop.
2. **Verify** `$ARGUMENTS/plan.md` exists.
3. **Derive identifiers** from the artifact directory:
   - `<id>` = `basename "$ARGUMENTS"`
   - Branch name = `<id>`
   - Worktree path = follow Claude Code's native worktree convention
     (see `skills/worktree-isolation/SKILL.md`)
4. **Confirm with the user** before executing:
   ```
   Ready to create worktree:

   Worktree: <path>
   Branch:   <id>
   Plan:     $ARGUMENTS/plan.md

   Proceed?
   ```
5. **Create the worktree** after the user confirms.
6. **Copy the artifact directory** into the worktree. Untracked files do
   not appear automatically in worktrees, and `docs/plans/<id>/` is
   typically untracked until it is committed:
   ```
   cp -r $ARGUMENTS <worktree>/docs/plans/<id>/
   ```

## Why isolate

Implementation work touches the working tree. A worktree gives the
implementer a clean checkout per topic, so concurrent pipelines do not
interfere. For trivial single-file changes, in-place implementation is
allowed — no worktree needed.

## Completion

Report the worktree path and tell the user:
**"Next: cd <worktree> and run `/team-implement docs/plans/<id>/`"**
