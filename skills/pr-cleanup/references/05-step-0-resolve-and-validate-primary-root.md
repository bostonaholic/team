### Step 0 — resolve and validate $PRIMARY_ROOT

Right after a merge this skill is often invoked from inside the very
worktree it is about to remove, so resolve the primary clone first, before
any destructive action. The whole resolve-validate-derive sequence is one
runnable block:

```sh
INVOKE_DIR="$(pwd -P)"
INVOKE_BRANCH="$(git branch --show-current)"
COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
[ -n "$COMMON_DIR" ] || { echo "refusing: cannot resolve the git dir" >&2; exit 1; }
PRIMARY_ROOT="$(dirname "$COMMON_DIR")"
[ "$(git -C "$PRIMARY_ROOT" rev-parse --path-format=absolute --git-dir)" = \
  "$(git -C "$PRIMARY_ROOT" rev-parse --path-format=absolute --git-common-dir)" ] &&
  [ "$PRIMARY_ROOT" = "$(git -C "$PRIMARY_ROOT" worktree list --porcelain | sed -n '1s/^worktree //p')" ] &&
  [ "$(git -C "$PRIMARY_ROOT" rev-parse --show-toplevel)" = "$PRIMARY_ROOT" ] ||
  { echo "refusing: '$PRIMARY_ROOT' failed primary-clone validation — re-run from the primary clone" >&2; exit 1; }
REPO="$(cd "$PRIMARY_ROOT" && gh repo view --json nameWithOwner --jq .nameWithOwner)"
[ -n "$REPO" ] || { echo "refusing: cannot resolve <owner>/<repo> — run 'gh auth status', fix what it reports, and re-run" >&2; exit 1; }
```

The first two captures are deliberately unanchored: anchoring either would
read the primary clone's checkout (typically the default branch) and
resolve the wrong target. Step 2's no-argument fallback consumes
`$INVOKE_BRANCH`; `$INVOKE_DIR` records where the run started, so a
worktree-removal step can tell that the invocation cwd is inside the
worktree about to be removed.

ALL three AND-ed checks must hold; a failed or unrunnable check refuses.
Passing one alone proves nothing — from inside a submodule the first
passes while the other two fail.

**This block re-runs in every Bash invocation that uses `$PRIMARY_ROOT`
or `$REPO` (Hard Rule 11).** The `${VAR:?}` guards at the destructive
sinks are the backstop, not the mechanism.

From here on every git command is `git -C "$PRIMARY_ROOT"` (Hard Rule 9).
Exactly four other anchors exist: step 0's `$INVOKE_BRANCH` capture above
(`git branch --show-current` against the invoking directory), the Input
section's `git check-ref-format --branch` (reads no repository state, and
re-runs after step 0 for stack-resolved names), step 3's dirty-tree check
inside a still-present linked worktree
(`git -C "$WORKTREE_PATH" status --porcelain`), and step A2's inspection of
what blocks a removal (`git -C "$WORKTREE_PATH" status --short`). The
bash call that removes a worktree first runs `cd "$PRIMARY_ROOT"`, so no
later command depends on a working directory that no longer exists.
