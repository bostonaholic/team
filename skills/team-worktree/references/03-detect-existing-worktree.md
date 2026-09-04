## Detect existing worktree

**Never create a nested worktree.** For each target repo, determine if the
current checkout is a **linked worktree**. That is any working tree other
than the repository's main working tree, wherever it lives on disk. In the
main working tree the git dir and the common git dir are the same path. In
a linked worktree they differ:

```sh
[ "$(git -C <repo-path> rev-parse --path-format=absolute --git-dir)" != \
  "$(git -C <repo-path> rev-parse --path-format=absolute --git-common-dir)" ] \
  && echo "linked worktree"
```

If the checkout is a linked worktree, check which branch it is on:

```sh
git -C <repo-path> rev-parse --abbrev-ref HEAD
```

Compare against the repo's default branch
(`git -C <repo-path> symbolic-ref refs/remotes/origin/HEAD | sed
's@^refs/remotes/origin/@@'`, falling back to `main`/`master` if unset):

- **Non-default branch** → **skip worktree creation for this repo.**
  Announce once: "Already in worktree `<path>` on branch `<branch>` —
  skipping worktree creation, continuing in place." Then treat the current
  checkout as this repo's worktree for the rest of the pipeline. Work
  continues on the current branch — no `<id>` branch is created.
- **Default branch** → report and stop. Implementing directly on the
  default branch inside a worktree is never acceptable, and nesting
  worktrees is not supported. The user should switch that worktree to a
  feature branch (or invoke `/team` from a non-worktree checkout) before
  retrying.

If the checkout is **not** a linked worktree, this repo proceeds through
the normal creation flow below.

In multi-repo mode, this check applies to **every** listed repo, not just
the home repo. Skipped repos reuse their current checkout. The remaining
repos still get fresh `<id>`-branch worktrees.
