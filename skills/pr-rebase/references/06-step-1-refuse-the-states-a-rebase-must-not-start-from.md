### Step 1 — refuse the states a rebase must not start from

All of these are refusals, checked before anything is rewritten:

- **A dirty tree.** `git status --porcelain` is non-empty for tracked files
  → stop and show them. Untracked files are fine; a rebase does not touch
  them.
- **An operation already in progress.** `git rebase --show-current-patch`
  succeeding, or `.git/MERGE_HEAD` / `.git/CHERRY_PICK_HEAD` existing →
  stop. Finish or abort it first; report which one is live.
- **The checkout is a protected branch** (Hard Rule 6). Compare
  case-insensitively — on a case-insensitive filesystem `Main` *is* `main`:

  ```sh
  : "${BASE:?refusing: base branch unresolved — re-run the discovery chain}"
  : "${BRANCH:?refusing: no branch resolved}"
  LOWER="$(printf '%s' "$BRANCH" | tr '[:upper:]' '[:lower:]')"
  BASE_LOWER="$(printf '%s' "$BASE" | tr '[:upper:]' '[:lower:]')"
  case "$LOWER" in
    "$BASE_LOWER"|main|master|develop|release/*)
      echo "refusing: '$BRANCH' is a protected branch, not a feature branch" >&2; exit 1 ;;
  esac
  ```

  The `: "${VAR:?}"` guards are standalone statements ahead of the lowering.
  Nested inside `$( )` a `:?` kills only the subshell, the assignment
  completes empty, and the first case pattern silently vanishes.
- **A PR argument that names a different head branch.** Refuse and say so;
  never check out another branch to satisfy the argument.
