## Detect existing worktree

**Never create a nested worktree.** For each target repo, check whether the
current checkout is a **linked worktree** — any working tree other than the
repository's main one, wherever it lives on disk. Its git dir and common git
dir differ:

```sh
[ "$(git -C <repo-path> rev-parse --path-format=absolute --git-dir)" != \
  "$(git -C <repo-path> rev-parse --path-format=absolute --git-common-dir)" ] \
  && echo "linked worktree"
```

If it is linked, compare its branch (`git -C <repo-path> rev-parse --abbrev-ref HEAD`)
against the repo's default branch
(`git -C <repo-path> symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'`,
falling back to `main`/`master` if unset):

- **Non-default branch** → **skip worktree creation for this repo.**
  Announce once: "Already in worktree `<path>` on branch `<branch>` —
  skipping worktree creation, continuing in place." Treat the current
  checkout as this repo's worktree for the rest of the pipeline, on its
  current branch — no `<id>` branch is created.
- **Default branch** → report and stop. Tell the user to switch that
  worktree to a feature branch (or invoke `/team` from a non-worktree
  checkout) before retrying.

A checkout that is not linked proceeds to normal creation. In multi-repo
mode, run this check for **every** listed repo: skipped repos reuse their
current checkout, and the rest still get fresh `<id>`-branch worktrees.
