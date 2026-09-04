### Step 0 — resolve and validate $PRIMARY_ROOT

The common topology is the failure case: right after a merge, this skill is
often invoked from inside the very worktree it is about to remove. Resolve
the primary clone first, before any destructive action. The whole
resolve-validate-derive sequence is one runnable block:

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

The first two captures are deliberately unanchored — they run against the
invoking directory, before the anchoring rule takes effect.
`$INVOKE_BRANCH` is the branch checked out where the command was run;
step 2's no-argument fallback consumes it. `$INVOKE_DIR` records where the
run started, so a worktree-removal step can tell that the invocation cwd
is inside the worktree about to be removed. Anchoring either capture would
read the primary clone's checkout — typically the default branch — and
resolve the wrong target.

Capture the `rev-parse` output and test it before `dirname` runs —
`dirname ""` prints `.` and exits 0, which would mask a failed resolution
as a relative path.

The three AND-ed checks **validate** the resolution — a resolved path is
not automatically a working tree (submodules and separate git dirs both
produce paths that exist but are wrong). ALL of them must hold; a failed
or unrunnable check refuses. Passing one check alone proves nothing —
from inside a submodule the first check passes while the other two fail:

- `git -C "$PRIMARY_ROOT" rev-parse --path-format=absolute --git-dir` must
  equal its `--git-common-dir` output, and
- `$PRIMARY_ROOT` must equal the first `worktree ` entry of
  `git -C "$PRIMARY_ROOT" worktree list --porcelain` (the first entry is
  always the main working tree), and
- `git -C "$PRIMARY_ROOT" rev-parse --show-toplevel` must print exactly
  `$PRIMARY_ROOT`.

If resolution or validation fails, **refuse before any destructive step**
and tell the user to re-run from the primary clone.

The `$REPO` slug anchors every `gh` command (Hard Rule 9) — `gh`'s own
cwd detection would point at whatever directory the run happens to sit
in, possibly the worktree about to be destroyed.

**This block re-runs in every Bash invocation that uses `$PRIMARY_ROOT`
or `$REPO` (Hard Rule 11).** Shell variables do not survive from one
invocation to the next, so a later invocation that assumed they did would
run its destructive command with an empty expansion. The `${VAR:?}`
guards at the destructive sinks are the backstop, not the mechanism.

From here on the anchoring rule (Hard Rule 9) applies: every git command is
`git -C "$PRIMARY_ROOT"`. Exactly four other anchors exist: step 0's
invoking-branch capture above (`git branch --show-current` against the
invoking directory — the anchored form would name the primary clone's
checkout, not the cleanup target), the Input section's
`git check-ref-format --branch` (a pure ref-syntax check that reads no
repository state, and re-runs after step 0 for stack-resolved names),
step 3's dirty-tree check inside a
still-present linked worktree
(`git -C "$WORKTREE_PATH" status --porcelain`), and step A2's inspection of
what blocks a removal (`git -C "$WORKTREE_PATH" status --short`). The
bash call that removes a worktree first runs `cd "$PRIMARY_ROOT"`, so no
later command depends on a working directory that no longer exists.
