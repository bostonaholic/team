# Sweeping Local State

Before each consuming step, read its linked shared rules from this installed playbook directory. If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.
Read [external-data rules](../team/references/external-data.md) from the installed playbook directory before teardown; stop with the resolved path on failure.

A caller that has finished with a pull request — merged, closed, or
reviewed — follows this file. `skills/pr-cleanup/SKILL.md` is the standing
caller: it loads this after the worktree is removed and before it reports.

## Ownership boundary

Run only the rows marked **this skill**. The others already ran, or will run,
in the caller.

| State | Owner |
|---|---|
| Worktrees, local and remote branches, stale tracking refs | the caller (`pr-cleanup` Modes A/B) |
| `docs/plans/<id>/` planning scratch | the caller (`pr-cleanup` Mode B step 6) |
| Leftover directories under `.claude/worktrees/` | the worktree playbook teardown step 7 |
| Databases, containers, queues, buckets, caches | **this skill** |
| Temp-directory scratch the run recorded | **this skill** |

Never re-run a step the caller owns: `pr-cleanup` gates its deletions on a
merged-PR verification and on protected-name refusals, and a second, ungated
pass at the same target is the ungated path those rules exist to prevent.

## Inputs the caller supplies

| Variable | Meaning |
|---|---|
| `PRIMARY_ROOT` | Absolute path to the primary clone, already validated |
| `DEFAULT` | The repo's default branch name |
| `BRANCH` | The branch the finished work lived on |
| `WORKTREE` | Absolute path of the worktree that was removed, or empty when there was none |

Derive missing repo/default values through `pr-cleanup` steps 0/1. A caller that holds
none of these derives `PRIMARY_ROOT` with `skills/pr-cleanup/SKILL.md` step 0 and
`DEFAULT` with its step 1. Do not hand-roll either derivation, and do not accept an
unvalidated `PRIMARY_ROOT`. Every invocation below re-derives what it uses in that same
invocation, and every expansion feeding a removal or a command uses the `${VAR:?}` form.

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
([external-data rules](../team/references/external-data.md)). Never guess credentials.
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
`rm -rf "$TMPROOT"/groom-backlog.*`): it cannot tell a dead run's directory
from a live one's, and deleting a live one kills a run in progress. An
unrecorded temp path is left on disk and named in the report instead.

### Step 3 — report

Report per [Report](#report) below, then hand back to the caller.

## Finishing a review rather than a merge

A completed review usually leaves nothing on the machine; when it left no
local state, say so and stop.

When a review did leave state — you checked out the author's branch, booted
their app, provisioned a database to run their tests — the two steps above run
unchanged, with one boundary that does not apply to your own merged work:

- The branch and the PR belong to someone else. Remove the local checkout if
  you made one, and nothing else. No `git push --delete`, no `gh pr close`, no
  branch deletion on origin.
- The branch under review is unlanded code, so its `.teamteardown` is exactly
  the copy that must not run.

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
Never block caller teardown ([verified results rules](../team/principles/verified-results.md)).
