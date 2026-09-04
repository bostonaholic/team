### Mode A — merged

1. **Verify the PR merged** (the gate that makes `-D` acceptable). The
   gate checks identity and containment, never a name match alone — on a
   public repo `--head` also matches merged PRs from ANY fork whose head
   branch shares the name, and a fork's PR must never license deleting a
   same-named local branch. Fetch first (Hard Rule 3), then list the
   candidates:

   ```sh
   git -C "$PRIMARY_ROOT" fetch origin
   gh pr list --state merged --head "$BRANCH" --json number,mergedAt,headRepositoryOwner,headRefOid,mergeCommit --limit 10 --repo "$REPO"
   ```

   A non-zero `gh` exit (rate limit, missing scopes, wrong `--repo`)
   refuses the run outright — a failed check is NOT an empty result. From
   the exit-0 output, select the entry whose `headRepositoryOwner.login`
   equals the owner half of `$REPO`; when `$ARGUMENTS` named a PR, the
   selected entry must be that PR's number. No same-repo entry → warn
   ("no merged PR found for `$BRANCH` in this repo — delete anyway?") and
   wait for explicit confirmation before any deletion.

   With a same-repo entry, confirm the merge actually landed and the
   local branch holds exactly what the PR merged — capture `$HEAD_OID`
   (the entry's `headRefOid`) and `$MERGE_OID` (its `mergeCommit.oid`) in
   the SAME invocation:

   ```sh
   [ "$(git -C "$PRIMARY_ROOT" rev-parse "refs/heads/$BRANCH")" = "${HEAD_OID:?}" ] &&
     git -C "$PRIMARY_ROOT" merge-base --is-ancestor "${MERGE_OID:?}" "origin/${DEFAULT:?}" ||
     { echo "gate failed: '$BRANCH' does not match the merged PR, or the merge is not in origin/$DEFAULT" >&2; exit 1; }
   ```

   Containment is checked on the **merge commit**, not the branch tip — a
   squash merge rewrites the history, so the branch tip is never an
   ancestor of the default branch. Either check failing halts the block
   with `exit 1` — never a warning to continue past. On that non-zero
   exit, STOP: report which check failed, ask the user whether to delete
   anyway, and wait for the answer before running any later step. Only
   the user's explicit delete-anyway confirmation (Hard Rule 1) re-enters
   the flow, and the completion report must state that the gate was
   overridden.

2. **Remove the branch's worktree, try-then-confirm.** Detect it and
   capture its path in the same invocation as the removal:

   ```sh
   # Never reach for awk's record variable here: a `$` before a digit is an
   # argument placeholder the loader substitutes before you read this.
   WORKTREE_PATH="$(git -C "$PRIMARY_ROOT" worktree list --porcelain |
     while IFS= read -r line; do
       case "$line" in
         "worktree "*)                candidate="${line#worktree }" ;;
         "branch refs/heads/$BRANCH") printf '%s\n' "$candidate"; break ;;
       esac
     done)"
   ```

   Empty `$WORKTREE_PATH` → the branch lives in no worktree; skip this
   step. A `$WORKTREE_PATH` outside the repository's `.claude/worktrees/`
   was created by something other than Team — a workspace manager, or the
   user by hand — and is not this skill's to remove: skip this step, say
   so, and name the path; that tool's own teardown removes it. The
   remaining steps (resync, branch delete, prune) still run, except that a
   branch checked out in such a worktree is left for that teardown too.
   Otherwise:

   ```sh
   cd "$PRIMARY_ROOT"
   git -C "${PRIMARY_ROOT:?}" worktree remove "${WORKTREE_PATH:?}"
   ```

   No force on the first attempt: a merged branch's worktree can hold real
   local files (`.env` copies, uncommitted scratch). If git refuses, show
   what blocks it (`git -C "$WORKTREE_PATH" status --short`) and ask for
   confirmation before retrying with `--force` appended. Never
   `git checkout` inside a linked worktree — checking out the default
   there fails when the primary clone holds it.

3. **Resync the default branch:**

   ```sh
   git -C "$PRIMARY_ROOT" fetch origin
   git -C "$PRIMARY_ROOT" checkout "${DEFAULT:?}"
   git -C "$PRIMARY_ROOT" pull --ff-only
   ```

   If `--ff-only` fails, stop and surface the divergence — never force,
   never auto-resolve.

4. **Delete the local branch** — only after an exact-case match against a
   real local branch (Hard Rule 10). On a case-insensitive filesystem
   `git branch -D` resolves `Main` to `main`, so the name must exist byte
   for byte before `-D` runs:

   ```sh
   git -C "$PRIMARY_ROOT" for-each-ref --format='%(refname:short)' refs/heads |
     grep -qxF -- "$BRANCH" || { echo "refusing: no local branch named exactly '$BRANCH' — already deleted (done, not an error) or cased differently; check 'git branch --list'" >&2; exit 1; }
   git -C "${PRIMARY_ROOT:?}" branch -D -- "${BRANCH:?}"
   ```

5. **Shared tail.** Remote deletion is usually automatic on merge; check
   whether origin still has the branch with
   `git -C "$PRIMARY_ROOT" ls-remote --heads origin -- "$BRANCH"` and OFFER
   deletion if it does. Then run the local-state sweep and the scratch
   removal exactly as Mode B steps 5 and 6 describe them.

6. **Sever the stale tracking ref, and offer to reclaim the space.**
   Deleting a branch does not release its commits. When GitHub deletes the
   head branch on merge — or `gh pr close --delete-branch` deletes it
   through the API — the deletion happens server-side, and the local
   `refs/remotes/origin/$BRANCH` survives. That ref keeps every commit on
   the branch **reachable**, so the repo looks clean while still pinning
   the objects: `git fsck` reports zero unreachable, and
   `git gc --prune=now` collects nothing, because from git's view nothing
   is garbage yet. Pruning the tracking ref is what turns those commits
   into garbage:

   ```sh
   git -C "$PRIMARY_ROOT" remote prune origin
   ```

   Run this whenever the remote branch is gone — `ls-remote` in step 5
   already answered that. `git fetch --prune` does the same thing.

   Reclaiming the disk space needs two more commands, and they are
   **destructive well beyond this branch**:

   ```sh
   git -C "$PRIMARY_ROOT" reflog expire --expire-unreachable=now --all
   git -C "$PRIMARY_ROOT" gc --prune=now
   ```

   The reflog expiry drops every repository-wide reflog entry pointing at
   an unreachable commit, so anything not reachable from a branch, tag,
   stash, or worktree HEAD becomes unrecoverable — a botched rebase's
   pre-rebase state, an abandoned experiment, a detached HEAD. Commits and
   uncommitted work still referenced by a live ref are untouched. Offer
   these two only when reclaiming space is the actual goal, and run them
   only on explicit confirmation; cleaning up one merged branch never
   requires them.

   Order is load-bearing. Run `gc` before the prune and it sees a
   reachable branch and no-ops, leaving the objects exactly where they
   were — a cleanup that reports success and frees nothing.
