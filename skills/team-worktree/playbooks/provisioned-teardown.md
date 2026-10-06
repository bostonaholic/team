# Sweeping Local State

Before each consuming step, read its linked shared rules. Resolve links in this file from this file's own directory. If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.
Read [external-data rules](../../team/references/external-data.md) before teardown; stop with the resolved path on failure.

The worktree playbook's teardown step 8 follows this file after the worktree is removed.

Shell variables do not persist between calls, so each fence below binds and derives everything it expands, and runs as one call. A value is pasted only inside single quotes. A supplied value is refused, not pasted, when it contains a single quote, a newline, `$`, or a backtick.

## Ownership boundary

Run only the rows marked **this skill**. The others already ran, or will run,
in the caller.

| State | Owner |
|---|---|
| Worktrees, local branches, stale tracking refs | the worktree playbook teardown steps 1-5 (step 5 prunes the tracking ref) |
| `docs/plans/<id>/` planning scratch | teardown step 6 |
| Leftover directories under `.claude/worktrees/` | teardown step 7 |
| Databases, containers, queues, buckets, caches | **this skill** |

Never re-run a step the worktree playbook owns: a second pass at the same target bypasses the guards that playbook applies.

## Inputs

| Variable | Meaning | Source |
|---|---|---|
| `REPO_PATH` | The repository being torn down | the worktree playbook's teardown step 8, as `<repo-path>` in its steps 3 and 5 |
| `BRANCH` | The branch the finished work lived on | teardown step 8, recorded before step 1 |
| `WORKTREE` | Absolute path of the worktree that was removed, or empty when there was none | teardown step 8, recorded before step 1 |
| `PRIMARY_ROOT` | Absolute path to the primary clone, validated | derived in Step 1's fence |
| `DEFAULT` | The repo's default branch name | derived in Step 1's fence |

Step 1's fence binds the first three as single-quoted literals on its first
lines, then derives `PRIMARY_ROOT` and validates it with three checks, all of
which must hold. A failed or unrunnable check refuses, and teardown reports the message and
stops. Do not accept an unvalidated `PRIMARY_ROOT`.

The same fence derives `DEFAULT` by running, in order, the first that succeeds:

1. `git -C "$PRIMARY_ROOT" symbolic-ref --short refs/remotes/origin/HEAD`
   (strip the `origin/` prefix).
2. `git -C "$PRIMARY_ROOT" remote set-head origin --auto`, then retry the
   `symbolic-ref` above.
3. Offline fallback: probe which of `main` or `master` exists locally via
   `git -C "$PRIMARY_ROOT" rev-parse --verify --quiet <name>`.
4. Neither exists → stop and ask the user.

Every expansion feeding a removal or a command uses the `${VAR:?}` form.

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
common case, not an error: report that no declaration exists.

## Procedure

### Step 1 — run the declared teardown

Run this whole fence as one call, with the three inputs filled in literally.
Print each command before running it:

```sh
REPO_PATH='<repo-path>'
BRANCH='<branch>'
WORKTREE='<worktree path, or empty for an in-place run>'
: "${REPO_PATH:?refusing: repo path unset}"
: "${BRANCH:?refusing: branch unset}"
COMMON_DIR="$(git -C "$REPO_PATH" rev-parse --path-format=absolute --git-common-dir)"
[ -n "$COMMON_DIR" ] || { echo "refusing: cannot resolve the git dir" >&2; exit 1; }
PRIMARY_ROOT="$(dirname "$COMMON_DIR")"
[ "$(git -C "$PRIMARY_ROOT" rev-parse --path-format=absolute --git-dir)" = \
  "$(git -C "$PRIMARY_ROOT" rev-parse --path-format=absolute --git-common-dir)" ] &&
  [ "$PRIMARY_ROOT" = "$(git -C "$PRIMARY_ROOT" worktree list --porcelain | sed -n '1s/^worktree //p')" ] &&
  [ "$(git -C "$PRIMARY_ROOT" rev-parse --show-toplevel)" = "$PRIMARY_ROOT" ] ||
  { echo "refusing: '$PRIMARY_ROOT' failed primary-clone validation — re-run from the primary clone" >&2; exit 1; }
# DEFAULT: origin/HEAD; else set-head --auto and one retry; else main or master.
DEFAULT="$(git -C "$PRIMARY_ROOT" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)" ||
  { git -C "$PRIMARY_ROOT" remote set-head origin --auto >/dev/null 2>&1 &&
    DEFAULT="$(git -C "$PRIMARY_ROOT" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)"; } ||
  DEFAULT=''
DEFAULT="${DEFAULT#origin/}"
if [ -z "$DEFAULT" ]; then
  for NAME in main master; do
    if git -C "$PRIMARY_ROOT" rev-parse --verify --quiet "$NAME" >/dev/null; then
      DEFAULT="$NAME"
      break
    fi
  done
fi
[ -n "$DEFAULT" ] ||
  { echo "refusing: no default branch found — ask the user which branch is the default" >&2; exit 1; }
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

### Step 2 — report

Report per [Report](#report) below, then hand back to the caller.

## Report

One line per thing that happened, and nothing else:

- Each declared command that ran, and its outcome — `ok`, `FAILED (exit N)`,
  or `TIMEOUT`.
- Each refusal, with the check that fired.
- `No .teamteardown on <default> — nothing declared.` when the file is absent,
  rather than silence that reads as a clean sweep.

Anything left on disk is named.
Never block caller teardown ([verified results rules](../../team/principles/verified-results.md)).
