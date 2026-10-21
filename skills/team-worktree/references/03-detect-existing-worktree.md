## Detect existing worktree

**Never create a nested worktree.** `<team-worktree-skill-dir>` is the absolute directory holding the installed
`skills/team-worktree/SKILL.md`. For each target repo, run:

```sh
"<team-worktree-skill-dir>/scripts/detect-worktree.sh" '<repo-path>'
```

Paste `<repo-path>` single-quoted; refuse a path containing a single quote.
The script header lists each output line and exit code.

- **`create`** → not linked: normal creation.
- **`reuse <branch> <path>`** → **skip worktree creation for this repo.**
  Announce once: "Already in worktree `<path>` on branch `<branch>` —
  skipping worktree creation, continuing in place." The current checkout and
  branch serve the rest of the pipeline; no `<id>` branch is created.
- **`refuse <branch> <path>`** → report and stop. Tell the user to switch that
  worktree to a feature branch (or invoke `/team` from a non-worktree
  checkout) before retrying.
- **Exit 1** → report its stderr verbatim and stop for that repo.

In multi-repo mode, check **every** listed repo.
