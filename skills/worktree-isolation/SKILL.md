---
name: worktree-isolation
description: 'Defines worktree isolation methodology. Load when agents need its procedure.'
user-invocable: false
---

# Worktree Isolation

Each `/team` run uses one isolated worktree per affected repo. The router owns isolation.
Read [references/lifecycle.md](references/lifecycle.md) before setup or teardown.

## Single-repo

Without `docs/plans/<id>/4-repos.md`, create the home worktree at
`<repo>/.claude/worktrees/<id>` on branch `<id>` from `origin/HEAD`.

## Multi-repo

With `4-repos.md`, create one worktree per listed repo on `<id>`. Require each
absolute repo realpath to be a direct sibling of home; refuse failures. Use:

`git -C <repo-path> worktree add .claude/worktrees/<id> -b <id> origin/HEAD`

The home worktree alone holds `docs/plans/<id>/`. Append all paths under
`## Worktrees` in `4-repos.md`.

## Reusing an existing worktree

When already in a linked worktree on a non-default branch, reuse it without a
new branch or copy. Refuse a linked worktree on the default branch. Use
`team-worktree` for git-dir/common-dir detection.

## Why first

WORKTREE is phase 1 of 8, before QUESTION. Create artifacts there so recovery can
infer WORKTREE before `1-task.md`. Report absolute `docs/plans/<id>/` path.

## Ship and teardown

Keep worktrees until merge or explicit removal. Prefer the PR-aware
`skills/pr-cleanup/SKILL.md`. The full eight-step manual is in the lifecycle
reference. Hard rules: preserve commits; never delete a primary clone; verify
each removed path; `pull --rebase origin <base>`; `remote prune origin`; verify
`docs/plans/<id>` is untracked before deleting only that topic; run
`skills/sweeping-local-state/SKILL.md` last and skip its reviewer-only section.

After removal, run this residue sweep exactly. It deletes only unregistered
directories with no `.git` and no files outside `tmp/`, `.omc/`, or `docs/plans/`:

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

Report every swept or kept directory and its unexpected files. Never wildcard-sweep.

## Gitignored and provisioned state

`.worktreeinclude` copies only matching gitignored files. `.teamteardown` owns
provisioned-resource cleanup; only its default-branch copy runs.

## Fallback

If creation fails, report the repo and continue in its main tree. Other repos
keep isolation. A home failure runs the pipeline in place; never block solely
because isolation failed.
