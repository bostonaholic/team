Before any agent dispatch, decide where to work. Implementation never runs
on the default branch. Resolve it as
`git symbolic-ref --short refs/remotes/origin/HEAD` without the `origin/`
prefix, falling back to whichever of `main`/`master` exists locally, and
compare it with `git rev-parse --abbrev-ref HEAD`.

1. If `$ARGUMENTS/4-repos.md` is present (multi-repo mode), a worktree must
   exist in **every** listed repo (read the `## Worktrees` section of
   `4-repos.md`). If any is missing, tell the user to run
   `/team-worktree [docs/plans/<id>/]` and stop.
2. Run `git rev-parse --absolute-git-dir`. If the path contains
   `/worktrees/`, you are already inside a linked worktree. On a
   non-default branch, proceed in place. On the default branch, stop and
   tell the user to switch that worktree to a feature branch. In
   multi-repo mode this should be the home repo's worktree.
3. If you are in the main working tree, ask where to run the implementation
   with a single `AskUserQuestion` question, a `Worktree` header, and these
   options:
   - **Worktree (Recommended)** — isolate this implementation in a new
     git worktree (or set of worktrees in multi-repo mode).
   - **In-place** — implement on the current branch in the main working
     tree. Offer this option only when the current branch is not the
     default branch.

   On **Worktree**, derive `<id>` from the resolved directory, create the
   worktree(s) via `/team-worktree [docs/plans/<id>/]`, tell the user the
   home worktree path, and ask them to re-run
   `/team-implement [docs/plans/<id>/]` from that directory. On
   **In-place**, proceed (single-repo only).
