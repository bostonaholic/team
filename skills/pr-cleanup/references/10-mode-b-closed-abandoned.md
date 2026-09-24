### Mode B — closed / abandoned

The explicit user request to abandon is the safety gate — no merged-PR
check applies, and closing an abandoned PR ALWAYS includes the full
teardown below, not just the close. Everything is per repo; for a stack,
order child before parent throughout.

The gate is [human control rules](../team/principles/human-control.md): abandon intent is
stated by the user, never inferred from a PR being stale, red, or unreviewed.

1. **Close the PR(s):**

   ```sh
   gh pr close --repo "${REPO:?}" -- "${NUMBER:?}"
   ```

   If a close fails mid-stack, stop and report exactly which PRs closed.

2. **Remove the worktree** (if the branch lives in one). Capture the path
   in the same invocation as the removal:

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

   Empty `$WORKTREE_PATH` → no worktree; skip this step. Otherwise:

   ```sh
   cd "$PRIMARY_ROOT"
   git -C "${PRIMARY_ROOT:?}" worktree remove --force "${WORKTREE_PATH:?}"
   ```

   `--force` is unconfirmed here: the explicit abandon request is the
   gate. Before removing, name in the report any files a
   `.worktreeinclude` copy placed in the worktree (a copied `.env`,
   credentials) — the forced removal discards them irreversibly, and the
   user may want to rescue one first.

3. **Delete local branches.** When a stack tool manages the branch, prefer
   its delete command; otherwise, per branch and child before parent, run
   the exact-case existence check before `-D` (Hard Rule 10):

   ```sh
   git -C "$PRIMARY_ROOT" for-each-ref --format='%(refname:short)' refs/heads |
     grep -qxF -- "$BRANCH" || { echo "refusing: no local branch named exactly '$BRANCH' — already deleted (done, not an error) or cased differently; check 'git branch --list'" >&2; exit 1; }
   git -C "${PRIMARY_ROOT:?}" branch -D -- "${BRANCH:?}"
   ```

4. **Delete remote branches:**

   ```sh
   git -C "${PRIMARY_ROOT:?}" push origin --delete -- "${BRANCH:?}" [<branch>...]
   ```

   When the branch was already deleted server-side
   (`gh pr close --delete-branch`, or the GitHub UI button), the push fails
   with "remote ref does not exist" and leaves the stale
   `refs/remotes/origin/$BRANCH` holding the whole branch reachable. Run
   `git -C "$PRIMARY_ROOT" remote prune origin` to sever it; Mode A step 6
   explains why that matters and what the full space-reclaim sequence
   costs.

5. **Sweep the machine-local state.** Follow
   `skills/pr-cleanup/playbooks/cleanup.md` — all sections, full depth. Skip
   "Finishing a review rather than a merge". Supply it `$PRIMARY_ROOT`,
   `$DEFAULT`, `$BRANCH`, and `$WORKTREE_PATH` as its `WORKTREE` (empty
   when no worktree existed). A failure there is reported and does not
   stop the git teardown.

6. **Remove planning scratch that lives outside the worktree.** First
   derive `$ID` explicitly — it is this feature's `docs/plans/` directory
   name, shaped `<TICKET>-<topic>` or `<YYYY-MM-DD>-<topic>`. Match the
   branch's topic against the directories under
   `$PRIMARY_ROOT/docs/plans/`; when zero or several match, ask the user
   rather than guess. Then delete only that directory, and only after
   proving it is untracked. The guard refuses an unset or multi-segment
   `$ID`, and a failed `ls-files` is NOT "untracked". This command runs in
   its own Bash invocation, so the step 0 block re-runs first in that same
   invocation (Hard Rule 11):

   ```sh
   case "$ID" in
     ''|-*|.*|*[!A-Za-z0-9._-]*)
       echo "refusing: scratch id '$ID' is unset or not a single path segment" >&2 ;;
     *)
       if ! tracked=$(git -C "$PRIMARY_ROOT" ls-files -- "docs/plans/$ID"); then
         echo "refusing: could not verify docs/plans/$ID is untracked" >&2
       elif [ -n "$tracked" ]; then
         echo "refusing: docs/plans/$ID is tracked" >&2
       else
         rm -rf "${PRIMARY_ROOT:?}/docs/plans/${ID:?}"
       fi ;;
   esac
   ```

   Never touch sibling `docs/plans/` directories for other in-flight work.

- End state: the primary clone is on `$DEFAULT` and clean.
- **Re-runs are idempotent.** An already-deleted branch or worktree is
  done, not an error — report it as such and continue.
- **`gh` unauthenticated** → stop and name the authentication failure; do
  not fall back to guessing merge state.
- **Branch protection rejects the remote deletion** → surface GitHub's
  rejection verbatim; never force.

Report, for both modes: the primary clone's state via
`git -C "$PRIMARY_ROOT" branch --show-current` and
`git -C "$PRIMARY_ROOT" status --short`, plus what was closed and deleted
(PRs, worktrees, local and remote branches, scratch dirs) and the
local-state sweep's own report from step 5. Mode A ends with
`git -C "$PRIMARY_ROOT" log --oneline -1` and reports
`On <default> at <sha> — <subject>. Deleted branch <branch>.` A few lines,
no more.
