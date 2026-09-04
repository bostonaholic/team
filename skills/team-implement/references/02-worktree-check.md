## Worktree Check

Before any agent dispatch, decide where to work:

1. **Read `$ARGUMENTS/4-repos.md` if present.** When present, you are in
   multi-repo mode. Make sure that a worktree exists in **every** listed
   repo (read the `## Worktrees` section). If any are missing, tell the user
   to run `/team-worktree [docs/plans/<id>/]` (the path is optional —
   discovery resolves it) and stop.
2. Run `git rev-parse --absolute-git-dir`. If the path contains
   `/worktrees/`, you are already inside a Claude Code worktree — proceed in
   place. In multi-repo mode this should be the home repo's worktree. The
   implementer cd's into the other repos' worktrees as the plan steps
   require.
3. If you are in the main working tree, use `AskUserQuestion` to ask
   where to run the implementation. Use a single question with a
   `Worktree` header and these options:
   - **Worktree (Recommended)** — isolate this implementation in a new
     git worktree (or set of worktrees in multi-repo mode).
   - **In-place** — implement on the current branch in the main working
     tree.

   - On **Worktree** — derive `<id>` from the resolved directory, create the
     worktree(s) via `/team-worktree [docs/plans/<id>/]`, tell the user
     the home worktree path, and ask them to re-run
     `/team-implement [docs/plans/<id>/]` from that directory.
   - On **In-place** — proceed. (In-place is single-repo only — refuse
     in-place if `4-repos.md` is present and tell the user that
     multi-repo work requires worktrees.)
