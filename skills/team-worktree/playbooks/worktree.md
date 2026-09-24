# Worktree Isolation

Every `/team` run works in one isolated git worktree per repository the topic
touches; main working trees are never touched. The router owns isolation, not
individual agents. Read this playbook before setup or teardown.

## Single-repo (default)

Without `docs/plans/<id>/4-repos.md`, the topic touches only the home repo
(the repo the user invoked `/team` from): one worktree on branch `<id>` off
`origin/HEAD`, at `<repo>/.claude/worktrees/<id>`.

## Multi-repo

With `docs/plans/<id>/4-repos.md` present, each listed repo gets one worktree
at `<repo-path>/.claude/worktrees/<id>`, all on branch `<id>` off that repo's
`origin/HEAD` (commands: `references/04-execution.md`). Containment comes
first: each `<repo-path>`'s `realpath` must resolve to a direct child of the
home repo's parent directory. A repo that fails is refused and reported —
`4-repos.md` content is not trusted blindly.

Only the **home repo's worktree** holds the canonical `docs/plans/<id>/`
artifact directory. The other worktrees do not duplicate it; agents read
artifacts from the home worktree path the orchestrator passes in.

## Worktree creation

For the home repo, use the host's native worktree support when it offers one
(Claude Code's `--worktree <topic>` or dispatch into a worktree context) and
`git worktree add` otherwise. For the other repos in multi-repo mode, use
plain `git worktree add`, because a native flag only knows about the repo the
session was launched from.

## Lifecycle

### Setup (router responsibility)

At the **leading WORKTREE phase** — phase 1 of 8, before QUESTION — the
router creates the home repo's worktree on branch `<id>` off `origin/HEAD`
and authors `docs/plans/<id>/` **inside** it, so no copy is ever needed.
Secondary repos get theirs after the design review, once `4-repos.md`
confirms the repo set.

### Reusing an existing worktree

If the session already runs inside a linked worktree on a **non-default
branch**, WORKTREE reuses it in place, with no new branch and no artifact
copy. On the default branch it refuses and stops. Follow "Detect existing
worktree" (`references/03-detect-existing-worktree.md`).

### Why first

Worktree creation is the leading phase — it runs first, before QUESTION —
for two load-bearing reasons. First, authoring `docs/plans/<id>/` inside the
worktree from phase 1 keeps the home checkout's `git status` clean for the
entire run. Second, it gives resume detection a genuine first state: "a
worktree exists for `<id>`, no `1-task.md` yet" ⇒ WORKTREE.

### Ship (teardown)

Opening a PR does **not** tear down the worktree. Keep it until the PR is
merged or the user explicitly asks to remove it. The same holds when commits
are kept locally without a PR.

The user-invoked, PR-aware teardown — with a merged-PR gate,
protected-branch refusals, and remote-branch deletion — is `/pr-cleanup`
(`skills/pr-cleanup/SKILL.md`); the numbered steps below remain the
orchestrator's in-pipeline teardown.

When teardown is warranted (post-merge or on explicit request):

1. For each worktree with commits ahead of its base branch, cherry-pick
   or rebase those commits onto the target branch in that repo. Then let
   the host remove the worktree, or run `git worktree remove`.
2. Empty worktrees clean up automatically.
3. If manual cleanup is needed: `git -C <repo-path> worktree remove
   <worktree-path>` and `git -C <repo-path> branch -D <id>`.
4. **Assert the path is actually gone.** A long-lived process anchored to
   the old path (an editor language server, a hook) can recreate it after
   `git worktree remove` exits 0. Re-check the path, and delete a
   reappeared one only when it is `<repo-root>/.claude/worktrees/<name>`:
   never a path still listed by `git worktree list`, and never a primary
   clone.
5. After the worktree is gone, update the repo's local default branch
   with the merge: `git -C <repo-path> pull --rebase origin <base>`.
   Always rebase — never a merge commit. When the merge also deleted the
   branch on origin, follow with `git -C <repo-path> remote prune origin`:
   the surviving local `refs/remotes/origin/<id>` keeps every commit on the
   branch reachable, so `git branch -D` in step 3 frees nothing while it
   stands. `skills/pr-cleanup/SKILL.md` Mode A step 6 covers this and the
   space-reclaim sequence that follows it.
6. Remove the feature's local planning docs. Verify the directory is
   untracked first (`git ls-files docs/plans/<id>` returns nothing), then
   `rm -rf docs/plans/<id>` — only that feature's `<id>` directory, never
   sibling dirs for other in-flight work.
7. **Sweep residue as the final action.** Recreation can land seconds to
   hours after the removal command returns, so this sweep is not redundant
   with step 4. Re-check the removed path plus every sibling under
   `.claude/worktrees/` that `git worktree list` no longer knows about.
   Delete a directory only when it is pure regenerable residue: no `.git`
   entry, and no files outside `tmp/`, `.omc/`, and `docs/plans/`.

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

   Report each swept directory, or that no residue was found. A kept
   directory is surfaced to the user with the files it holds — never
   deleted silently, never left unreported.

8. **Tear down what the worktree provisioned**, not only the worktree.
   Follow `skills/pr-cleanup/playbooks/cleanup.md` — all sections, full
   depth. Skip "Finishing a review rather than a merge". It runs the
   teardown commands the repo declares in `.teamteardown`, and runs nothing
   when the repo declares none.

## Gitignored Files

A worktree is a fresh checkout without untracked files. To copy some in
(e.g. `.env`, `.env.local`), list them in a `.worktreeinclude` file at the
project root, in `.gitignore` syntax. Only files matching a pattern that are
also gitignored get copied. In multi-repo mode, each repo honors its own
`.worktreeinclude` independently.

## Provisioned resources

The teardown half of `.worktreeinclude` is `.teamteardown`, also at the
project root: one command per line, run when the worktree's work is
finished, so a database or container created for the branch does not
outlive it. Only the copy committed to the default branch ever runs.
`skills/pr-cleanup/playbooks/cleanup.md` carries the format and the rules;
teardown step 8 runs it.

## Fallback

If worktree creation fails in any repo (shallow clones, certain CI systems):

1. Report the failure for that repo: "Worktree creation failed in <name>.
   Falling back to main tree for that repo."
2. Continue the pipeline. Other repos still get worktrees. The failing
   repo's portion of the work runs in its main working tree.
3. If creation fails in the home repo, the orchestrator proceeds with
   in-place work for the entire pipeline.

Never block the pipeline because worktree creation failed.
