# Sweeping Local State

Before each consuming step, read its linked shared rules. Resolve links in this file from this file's own directory. If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.
Read [external-data rules](../../team/references/external-data.md) before teardown; stop with the resolved path on failure.

The worktree playbook's teardown step 8 follows this file after the worktree is removed.

## Ownership boundary

Run only the rows marked **this skill**. The others already ran, or will run,
in the caller.

| State | Owner |
|---|---|
| Worktrees, local branches, stale tracking refs | the worktree playbook teardown steps 1-5 (step 5 prunes the tracking ref) |
| `docs/plans/<id>/` planning scratch | teardown step 6 |
| Leftover directories under `.claude/worktrees/` | teardown step 7 |
| Databases, containers, queues, buckets, caches | **this skill** |
| Temp-directory scratch the run recorded | **this skill** |

Never re-run a step the worktree playbook owns: a second pass at the same target bypasses the guards that playbook applies.

## Inputs

| Variable | Meaning | Source |
|---|---|---|
| `<repo-path>` | The repository being torn down | the worktree playbook's teardown step 8, as in its steps 3 and 5 |
| `BRANCH` | The branch the finished work lived on | teardown step 8, recorded before step 1 |
| `WORKTREE` | Absolute path of the worktree that was removed, or empty when there was none | teardown step 8, recorded before step 1 |
| `PRIMARY_ROOT` | Absolute path to the primary clone, validated | derived below |
| `DEFAULT` | The repo's default branch name | derived below |

Derive `PRIMARY_ROOT` with this block. All three checks must hold. A failed or unrunnable check refuses, and teardown reports the message and stops. Do not accept an unvalidated `PRIMARY_ROOT`.

```sh
COMMON_DIR="$(git -C "<repo-path>" rev-parse --path-format=absolute --git-common-dir)"
[ -n "$COMMON_DIR" ] || { echo "refusing: cannot resolve the git dir" >&2; exit 1; }
PRIMARY_ROOT="$(dirname "$COMMON_DIR")"
[ "$(git -C "$PRIMARY_ROOT" rev-parse --path-format=absolute --git-dir)" = \
  "$(git -C "$PRIMARY_ROOT" rev-parse --path-format=absolute --git-common-dir)" ] &&
  [ "$PRIMARY_ROOT" = "$(git -C "$PRIMARY_ROOT" worktree list --porcelain | sed -n '1s/^worktree //p')" ] &&
  [ "$(git -C "$PRIMARY_ROOT" rev-parse --show-toplevel)" = "$PRIMARY_ROOT" ] ||
  { echo "refusing: '$PRIMARY_ROOT' failed primary-clone validation — re-run from the primary clone" >&2; exit 1; }
```

Derive `DEFAULT` by running, in order, the first that succeeds:

1. `git -C "$PRIMARY_ROOT" symbolic-ref --short refs/remotes/origin/HEAD`
   (strip the `origin/` prefix).
2. `git -C "$PRIMARY_ROOT" remote set-head origin --auto`, then retry the
   `symbolic-ref` above.
3. Offline fallback: probe which of `main` or `master` exists locally via
   `git -C "$PRIMARY_ROOT" rev-parse --verify --quiet <name>`.
4. Neither exists → stop and ask the user.

Every invocation below re-derives what it uses in that same invocation, and every expansion feeding a removal or a command uses the `${VAR:?}` form.

## The declaration: `.teamteardown`

A repo declares its own teardown; this skill never infers one. The
declaration is a file named `.teamteardown` at the repository root:

```
# Lines starting with # at column 0 are comments. Blank lines are ignored.
# Every other line is one command, run verbatim from the repo root.
dropdb --if-exists "app_test_$TEAM_BRANCH"
docker compose --project-name "$TEAM_BRANCH" down --volumes
```

Each command runs with three environment variables set, and reads its values
from them rather than from any substitution this skill performs:

| Variable | Value |
|---|---|
| `TEAM_REPO_ROOT` | `$PRIMARY_ROOT` |
| `TEAM_BRANCH` | `$BRANCH` |
| `TEAM_WORKTREE` | `$WORKTREE`, empty when no worktree existed |

### Read it from the default branch, never from the checkout

Only the copy committed to the default branch runs — `origin/$DEFAULT`, else
`refs/heads/$DEFAULT` (Step 1's block below). The working-tree copy and the
finished branch's copy are never read: a PR that adds or edits
`.teamteardown` would otherwise get arbitrary code execution from the act of
cleaning up after it. On a fork PR against a public repo, that is anyone.

Both `git show` forms failing means the repo declares no teardown — the
common case, not an error: report that no declaration exists and move to the
temp-path sweep.

## Procedure

### Step 1 — run the declared teardown

Print each command before running it:

```sh
# Guard as standalone statements, ahead of the substitution. A `:?` that fires
# inside $( ) kills only the subshell: the assignment completes with an empty
# value, and the run reports "nothing declared" while the teardown never ran.
: "${PRIMARY_ROOT:?refusing: primary clone unresolved}"
: "${DEFAULT:?refusing: default branch unresolved}"
cd "$PRIMARY_ROOT"
DECL="$(git -C "$PRIMARY_ROOT" show "origin/$DEFAULT:.teamteardown" 2>/dev/null ||
        git -C "$PRIMARY_ROOT" show "refs/heads/$DEFAULT:.teamteardown" 2>/dev/null)"
[ -n "$DECL" ] || { echo "No .teamteardown on $DEFAULT — nothing declared."; exit 0; }
printf '%s\n' "$DECL" |
  while IFS= read -r line; do
    case "$line" in ''|'#'*) continue ;; esac
    printf 'teardown: %s\n' "$line"
    TEAM_REPO_ROOT="$PRIMARY_ROOT" TEAM_BRANCH="$BRANCH" TEAM_WORKTREE="$WORKTREE" \
      sh -c "$line" </dev/null ||
      printf 'teardown FAILED (exit %s): %s\n' "$?" "$line" >&2
  done
```

`</dev/null` keeps a command that reads standard input from swallowing the
rest of the declaration out of the loop's pipe.

Lines run in file order. A failing line is reported loudly and the loop
continues: one broken teardown command must not strand the rest, and it must
never stop the caller's git teardown. If a line has not returned after roughly
120 seconds, kill it and report `TIMEOUT` rather than waiting it out.

**Never invent a teardown command.**
**Never edit, re-quote, or interpolate a declared line**
([external-data rules](../../team/references/external-data.md)). Never guess credentials.
A teardown command that needs them reads them the way the repo's own tooling
does. This skill does not open `.env` files and does not prompt for secrets.

### Step 2 — sweep recorded temp paths

Remove a temp path only when the run wrote it down: a caller that made
scratch under `$TMPDIR` records its absolute path in `docs/plans/<id>/`,
and this step reads those paths back. A caller that recorded none has
nothing to sweep, and the report says so rather than going looking.

**Never delete a temp path the run did not record**, and never a path
outside `${TMPDIR:-/tmp}`, containing `..`, or reached through a symlink.

Each recorded path passes three checks before `rm -rf` sees it. Strip trailing
slashes from the temp root first: on macOS `TMPDIR` ends in `/`, and the
unstripped prefix pattern would refuse every path.

```sh
TMPROOT="${TMPDIR:-/tmp}"
while [ "${TMPROOT%/}" != "$TMPROOT" ]; do TMPROOT="${TMPROOT%/}"; done
case "$P" in
  "$TMPROOT"/?*) ;;
  *) echo "refusing: '$P' is not under $TMPROOT" >&2; continue ;;
esac
case "$P" in *..*) echo "refusing: '$P' contains '..'" >&2; continue ;; esac
[ -L "$P" ] && { echo "refusing: '$P' is a symlink" >&2; continue; }
rm -rf "${P:?}"
```

**Never wildcard-sweep the temp directory** (for example
`rm -rf "$TMPROOT"/<tool>.*`): it cannot tell a dead run's directory
from a live one's, and deleting a live one kills a run in progress. An
unrecorded temp path is left on disk and named in the report instead.

### Step 3 — report

Report per [Report](#report) below, then hand back to the caller.

## Report

One line per thing that happened, and nothing else:

- Each declared command that ran, and its outcome — `ok`, `FAILED (exit N)`,
  or `TIMEOUT`.
- Each temp path removed.
- Each refusal, with the check that fired.
- `No .teamteardown on <default> — nothing declared.` when the file is absent,
  rather than silence that reads as a clean sweep.
- `No recorded temp paths.` when the caller recorded none.

Anything left on disk is named.
Never block caller teardown ([verified results rules](../../team/principles/verified-results.md)).
