## Detect existing worktree

**Never create a nested worktree.** A **linked worktree** is any working tree
other than the repository's main one, wherever it lives on disk.
`<team-worktree-skill-dir>` is the absolute directory that holds the installed
`skills/team-worktree/SKILL.md`. For each target repo, run:

```sh
"<team-worktree-skill-dir>/scripts/detect-worktree.sh" '<repo-path>'
```

Paste `<repo-path>` single-quoted; refuse a path that contains a single quote.
The script header lists each output line and exit code.

- **`create`** → not linked: proceeds to normal creation.
- **`reuse <branch> <path>`** → **skip worktree creation for this repo.**
  Announce once: "Already in worktree `<path>` on branch `<branch>` —
  skipping worktree creation, continuing in place." Treat the current
  checkout as this repo's worktree for the rest of the pipeline, on its
  current branch — no `<id>` branch is created.
- **`refuse <branch> <path>`** → report and stop. Tell the user to switch that
  worktree to a feature branch (or invoke `/team` from a non-worktree
  checkout) before retrying.
- **Exit 1** → report its stderr verbatim and stop for that repo.

In multi-repo mode, run this check for **every** listed repo: skipped repos
reuse their current checkout, and the rest still get fresh `<id>`-branch
worktrees.
