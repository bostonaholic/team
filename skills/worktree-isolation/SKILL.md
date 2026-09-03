---
name: worktree-isolation
description: Create, reuse, recover, and safely remove isolated worktrees for Team pipeline runs.
user-invocable: false
---

# Worktree Isolation

Each `/team` run uses one worktree per affected repo. The router owns setup;
agents operate only in the directory supplied to them.

## Input and topology

Without `docs/plans/<id>/4-repos.md`, create one home-repo worktree at
`<repo>/.claude/worktrees/<id>` on branch `<id>` from `origin/HEAD`, using
Claude Code native worktree support.

### Multi-repo

With `4-repos.md`, create one worktree per listed repo on the same `<id>` branch.
Before using a repo, require its realpath to be a direct child of the home
repo's parent; refuse and report failures. For each accepted repo:

`git -C <repo-path> worktree add .claude/worktrees/<id> -b <id> origin/HEAD`

The home worktree alone owns `docs/plans/<id>/`. After design review, append
`## Worktrees` to `4-repos.md` with the home and secondary absolute paths. Later
entry points recover topology from that section. Plain git worktrees and
Claude Code native worktrees are equivalent downstream.

## Setup

1. During the leading WORKTREE phase, create the home worktree and author the
   artifact directory inside it.
2. After design review confirms `4-repos.md`, create secondary worktrees.
3. Dispatch each step/slice in its annotated repo worktree. Pass every agent
   the home artifact path.

### Reusing an existing worktree

Compare the checkout's git dir with its common git dir. When already in a
linked worktree on a non-default branch, reuse it: create no branch, worktree,
or artifact copy. Refuse a linked worktree on the default branch; never nest a
worktree or implement on main/master. The internal `team-worktree` module owns
detection.

### Why first

Creating the home worktree before QUESTION keeps the primary checkout
untouched and makes `worktree exists, no 1-task.md` a recoverable WORKTREE state.
Always report the absolute worktree-rooted artifact path.

## During the pipeline

All agents run in their assigned worktree. In multi-repo mode, the implementer
changes worktrees per annotated step and commits each repo's part there. No
agent changes a primary checkout.

## Ship and teardown

Opening a PR or keeping local commits does not authorize teardown. Retain
worktrees until merge or explicit removal request. `/pr-cleanup`
(`skills/pr-cleanup/SKILL.md`) is the user-invoked PR-aware procedure. The
orchestrator uses the following only when teardown is authorized:

1. For each worktree ahead of base, replay its commits onto that repo's target
   branch by cherry-pick or rebase; then remove the worktree.
2. Let empty worktrees clean up automatically.
3. If needed, run `git -C <repo-path> worktree remove <worktree-path>` and
   `git -C <repo-path> branch -D <id>`.
4. Verify the path is gone. Delete a re-created path only when it is exactly
   `<repo-root>/.claude/worktrees/<name>`, is absent from `git worktree list`,
   and is not a primary clone.
5. Update local base with
   `git -C <repo-path> pull --rebase origin <base>`. If origin deleted the
   feature branch, run `git -C <repo-path> remote prune origin`.
6. Remove only untracked `docs/plans/<id>` after
   `git ls-files docs/plans/<id>` returns nothing. Never remove sibling topics.
7. As the final directory action, sweep unregistered residue. Delete only
   directories with no `.git` and no files outside `tmp/`, `.omc/`, and
   `docs/plans/`:

   ```sh
   root="$(git -C <repo-path> rev-parse --show-toplevel)"
   live="$(git -C "$root" worktree list --porcelain | sed -n 's/^worktree //p')"
   for dir in "$root"/.claude/worktrees/*; do
     [ -d "$dir" ] || continue
     printf '%s\n' "$live" | grep -qxF "$dir" && continue
     if [ -e "$dir/.git" ]; then
       echo "kept (still a checkout): $dir"; continue
     fi
     extra="$(find "$dir" -type f \
       -not -path "$dir/tmp/*" -not -path "$dir/.omc/*" -not -path "$dir/docs/plans/*")"
     if [ -n "$extra" ]; then
       printf 'kept (holds unexpected files): %s\n%s\n' "$dir" "$extra"
     else
       rm -rf "$dir" && echo "swept: $dir"
     fi
   done
   ```

   Report each swept path. Report every kept path and its files; otherwise say
   no residue was found.
8. Finally load `skills/sweeping-local-state/SKILL.md` and run all sections
   except `Finishing a review rather than a merge`. Its default-branch
   `.teamteardown` contract owns databases, containers, queues, and caches.

## Ignored files and provisioned resources

Worktrees omit untracked files. A repo may list gitignored setup files in
`.worktreeinclude`, using `.gitignore` syntax; each repo applies its own file.
Provisioned-resource teardown is declared separately in default-branch
`.teamteardown` and executed only by `sweeping-local-state`.

## Creation failure

If worktree creation fails, report
`Worktree creation failed in <name>. Falling back to main tree for that repo.`
Continue other repos in worktrees and run only the failed repo in its primary
checkout. A home-repo failure runs the pipeline in place. Never block solely
because isolation is unavailable.

## Done

Setup records every worktree in the canonical home artifact. Authorized
teardown removes only validated targets, updates base by rebase, reports
residue, and runs declared local-state teardown.
