# Worktree Isolation

Every `/team` run works in one isolated git worktree per repository the topic
touches; main working trees are never touched. The router owns isolation, not
agents.

## Single-repo (default)

Without `docs/plans/<id>/4-repos.md`, only the home repo (where the user
invoked `/team`) gets a worktree: branch `<id>` off `origin/HEAD`, at
`<repo>/.claude/worktrees/<id>`.

## Multi-repo

With `docs/plans/<id>/4-repos.md`, each listed repo gets the same layout
(commands: `references/04-execution.md`); a repo outside the home repo's
sibling set is refused and reported. Only the **home repo's worktree** holds
the canonical `docs/plans/<id>/`; agents read artifacts from the home
worktree path the orchestrator passes in.

## Worktree creation

For the home repo, use the host's native worktree support when offered
(Claude Code's `--worktree <topic>` or dispatch into a worktree context),
else `git worktree add`. Other repos always use plain `git worktree add`.

## Lifecycle

### Setup (router responsibility)

At the **leading WORKTREE phase** (phase 1, before QUESTION) the router
creates the home worktree and authors `docs/plans/<id>/` **inside** it.
Secondary repos get theirs after the design review, once `4-repos.md`
confirms the repo set.

### Reusing an existing worktree

A session already inside a linked worktree reuses it in place on a
non-default branch and refuses on the default branch, per
`references/03-detect-existing-worktree.md`.

### Why first

WORKTREE leads so `docs/plans/<id>/` lives inside the worktree from phase 1
and resume detection has a first state: "a worktree exists for `<id>`, no
`1-task.md` yet" ⇒ WORKTREE.

### Ship (teardown)

Opening a PR does **not** tear down the worktree. Run the steps below only
after the merge or on the user's explicit request, including when commits
stay local without a PR.

Before step 1, record for each repo `BRANCH` (the worktree's branch: `<id>`,
or the existing branch when WORKTREE reused a linked worktree) and
`WORKTREE` (its absolute path; empty when the run fell back to in-place
work). Step 8 passes both as single-quoted literals.

1. For each worktree with commits ahead of its base branch, cherry-pick
   or rebase them onto the target branch in that repo. Then let the host
   remove the worktree, or run `git worktree remove`.
2. Empty worktrees clean up automatically.
3. Manual cleanup if needed: `git -C <repo-path> worktree remove
   <worktree-path>` and `git -C <repo-path> branch -D <id>`.
4. **Assert the path is gone.** A long-lived process can recreate it after
   `git worktree remove` exits 0. Re-check, and delete a reappeared path
   only when it is `<repo-root>/.claude/worktrees/<name>`: never a path
   still in `git worktree list`, never a primary clone.
5. Update the repo's local default branch with the merge:
   `git -C <repo-path> pull --rebase origin <base>`. Always rebase, never a
   merge commit. When the merge deleted the branch on origin, follow with
   `git -C <repo-path> remote prune origin` so no stale
   `refs/remotes/origin/<id>` keeps the branch's commits reachable.
6. Remove the feature's local planning docs. Verify the directory is
   untracked (`git ls-files docs/plans/<id>` returns nothing), then
   `rm -rf docs/plans/<id>` — only this `<id>`, never sibling dirs.
7. **Sweep residue as the final action.** First run the worktree sweep once
   per repo. `<team-worktree-skill-dir>` is the absolute directory holding
   the installed `skills/team-worktree/SKILL.md`. For the home repo, run it
   from the session's working directory, with no `cd`:

   ```sh
   "<team-worktree-skill-dir>/scripts/sweep-worktrees.sh"
   ```

   For each other repo, paste `<repo-path>` single-quoted (refuse one
   containing a single quote); the subshell keeps the session's directory:

   ```sh
   (cd '<repo-path>' && "<team-worktree-skill-dir>/scripts/sweep-worktrees.sh")
   ```

   Then sweep residue for each repo:

   ```sh
   "<team-worktree-skill-dir>/scripts/sweep-residue.sh" '<repo-path>'
   ```

   Each script header lists its output lines and exit codes. Report every
   line of both sweeps, including each `kept` item and the files it holds;
   never remove a kept item by hand. On non-zero exit, report its stderr
   verbatim and continue the teardown.

8. **Tear down what the worktree provisioned** (databases, containers, and
   the like a root `.teamteardown` declares). For each repo, follow
   `<team-worktree-skill-dir>/playbooks/provisioned-teardown.md`, all
   sections, passing that repo's `<repo-path>` and the recorded `BRANCH` and
   `WORKTREE`.

## Gitignored Files

A root `.worktreeinclude` (`.gitignore` syntax) copies matching gitignored
files such as `.env` into the worktree; each repo honors its own.

## Fallback

If worktree creation fails in any repo (shallow clones, certain CI systems):

1. Report it: "Worktree creation failed in <name>. Falling back to main tree
   for that repo."
2. Continue: other repos still get worktrees; the failing repo's work runs in
   its main working tree. If the home repo fails, the whole pipeline runs in
   place. Never block the pipeline on this failure.
