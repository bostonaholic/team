### Mode B — closed / abandoned

The explicit user request to abandon is the safety gate — no merged-PR
check applies, and closing an abandoned PR ALWAYS includes the full
teardown below, not just the close. Everything is per repo; for a stack,
order child before parent throughout.

The gate is `principle-explicit-intent`: abandon intent is
stated by the user, never inferred from a PR being stale, red, or unreviewed.

1. **Close the PR(s):**

   ```sh
   gh pr close --repo "${REPO:?}" -- "${NUMBER:?}"
   ```

   Child PRs before parent so the stack unwinds cleanly. If a close fails
   mid-stack, stop and report exactly which PRs closed. Closed PRs keep
   their diffs viewable on GitHub after branch deletion.

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

   `--force` is unconfirmed here: untracked scratch is expected in an
   abandoned worktree, and the explicit abandon request is the gate.
   Before removing, name in the report any files a `.worktreeinclude`
   copy placed in the worktree (a copied `.env`, credentials) — the
   forced removal discards them irreversibly, and the user may want to
   rescue one first.

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

   `push --delete` removes the local `refs/remotes/origin/$BRANCH` along
   with the remote branch, so nothing further is needed on the happy path.
   It is a different story when the branch was already deleted
   server-side — `gh pr close --delete-branch`, or someone clicking the
   button in the GitHub UI. The push then fails with "remote ref does not
   exist" and the stale local tracking ref is left behind, still holding
   the whole branch reachable. Run
   `git -C "$PRIMARY_ROOT" remote prune origin` to sever it; Mode A step 6
   explains why that matters and what the full space-reclaim sequence
   costs.

5. **Sweep the machine-local state.** Follow
   `skills/sweeping-local-state/SKILL.md` — all sections, full depth. Skip
   "Finishing a review rather than a merge", which covers the reviewer
   case rather than this one. It removes what the git teardown above does
   not reach: databases, containers, and other resources the repo declares
   in `.teamteardown`, plus temp scratch this run recorded. Supply it
   `$PRIMARY_ROOT`, `$DEFAULT`, `$BRANCH`, and `$WORKTREE_PATH` as its
   `WORKTREE` (empty when no worktree existed). A failure there is
   reported and does not stop the git teardown.

6. **Remove planning scratch that lives outside the worktree.** First
   derive `$ID` explicitly — it is this feature's `docs/plans/` directory
   name, shaped `<TICKET>-<topic>` or `<YYYY-MM-DD>-<topic>`. Match the
   branch's topic against the directories under
   `$PRIMARY_ROOT/docs/plans/`; when zero or several match, ask the user
   rather than guess. Then delete only that directory, and only after
   proving it is untracked. The guard refuses an unset or multi-segment
   `$ID` (an empty expansion would target all of `docs/plans/`), and it
   must distinguish empty `ls-files` output from a failed command — a
   failed check is NOT "untracked". This command runs in its own Bash
   invocation, so the step 0 block re-runs first in that same invocation
   (Hard Rule 11), and the sink expands `$PRIMARY_ROOT` with `:?` so an
   unset value aborts instead of aiming `rm -rf` at a root-relative path:

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

- The primary clone is on `$DEFAULT` and clean.
- Mode A: the merged branch, its worktree, and its scratch dir are gone;
  the default branch is fast-forwarded to the merge.
- Mode B: every targeted PR is closed, and every trace — worktree, local
  and remote branches, scratch — is gone.
- No stale `refs/remotes/origin/$BRANCH` is left behind for a branch that
  no longer exists on origin.
- Nothing protected, tracked, or unconfirmed was deleted.

- **Re-runs are idempotent.** An already-deleted branch or worktree is
  done, not an error — report it as such and continue.
  The general rule: `principle-idempotent-reruns` — a re-run
  converges, and already-done is done.
- **`gh` unauthenticated** → stop and name the authentication failure; do
  not fall back to guessing merge state.
- **Branch protection rejects the remote deletion** → surface GitHub's
  rejection verbatim; never force.
- **Fetch before the gate.** A just-merged PR is invisible to the merged
  check until `git fetch` runs (Hard Rule 3).
- **A deleted branch is not a released branch.** Every branch deleted
  server-side leaves `refs/remotes/origin/<branch>` behind in the local
  clone, and that ref keeps the branch's whole history reachable. The
  usual diagnostics agree that nothing is wrong — `git fsck` finds zero
  unreachable objects, `git gc` frees nothing — because the objects are
  genuinely still referenced. Do not read that as "already clean";
  `git remote prune origin` is what severs the ref, and only afterward do
  the objects become collectable (Mode A step 6).

Report, for both modes: the primary clone's state via
`git -C "$PRIMARY_ROOT" branch --show-current` and
`git -C "$PRIMARY_ROOT" status --short`, plus what was closed and deleted
(PRs, worktrees, local and remote branches, scratch dirs) and the
local-state sweep's own report from step 5. Mode A ends with
`git -C "$PRIMARY_ROOT" log --oneline -1` and reports
`On <default> at <sha> — <subject>. Deleted branch <branch>.` A few lines,
no more.
