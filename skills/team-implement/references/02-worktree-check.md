Before any dispatch, decide where to work:

1. Multi-repo mode (`$ARGUMENTS/4-repos.md` present): a worktree must exist
   in **every** listed repo (per its `## Worktrees` section). If any is
   missing, tell the user to run `/team-worktree [docs/plans/<id>/]` and stop.
2. If `git rev-parse --absolute-git-dir` contains `/worktrees/`, you are in a
   linked worktree (in multi-repo mode, the home repo's): proceed in place.
3. In the main working tree, ask one `AskUserQuestion` question with a
   `Worktree` header and these options:
   - **Worktree (Recommended)** — isolate this implementation in a new
     git worktree.
   - **In-place** — implement on the current branch in the main working
     tree.

   On **Worktree**, derive `<id>` from the resolved directory, create the
   worktree(s) via `/team-worktree [docs/plans/<id>/]`, give the user the
   home worktree path, and ask them to re-run
   `/team-implement [docs/plans/<id>/]` from there. On **In-place**, proceed
   (single-repo only).
