---
name: sweeping-local-state
description: |
  Machine-local teardown procedure for finished work — remove the state a merged
  pull request, a closed pull request, or a completed review leaves on the machine
  that git teardown never reaches: provisioned databases, containers, queues,
  buckets, caches, and temp-directory scratch. Driven by a repo-declared
  `.teamteardown` command list read from the default branch, never from the branch
  being cleaned up. Loaded by pr-cleanup and by any caller finishing with a PR or
  a review.
user-invocable: false
---

# Sweeping Local State

Git teardown removes refs and checkouts. It does not touch what grew alongside
them: a database provisioned for the branch, a container still running, a
scratch directory under `$TMPDIR`, a bucket of fixtures. That state outlives
the branch, and nothing in the git commands notices.

This is a building block. A caller that has finished with a pull request —
merged, closed, or reviewed — reads this file and follows it.
`skills/pr-cleanup/SKILL.md` is the standing caller: it loads this after the
worktree is removed and before it reports.

## Ownership boundary

Run only the rows marked **this skill**. The others already ran, or will run,
in the caller.

| State | Owner |
|---|---|
| Worktrees, local and remote branches, stale tracking refs | the caller (`pr-cleanup` Modes A/B) |
| `docs/plans/<id>/` planning scratch | the caller (`pr-cleanup` Mode B step 6) |
| Leftover directories under `.claude/worktrees/` | `worktree-isolation` teardown step 7 |
| Databases, containers, queues, buckets, caches | **this skill** |
| Temp-directory scratch the run recorded | **this skill** |

Duplicating a caller's step is not harmless. `pr-cleanup` gates its deletions
on a merged-PR verification and on protected-name refusals; a second,
ungated pass at the same target is the ungated path those rules exist to
prevent.

## Inputs the caller supplies

| Variable | Meaning |
|---|---|
| `PRIMARY_ROOT` | Absolute path to the primary clone, already validated |
| `DEFAULT` | The repo's default branch name |
| `BRANCH` | The branch the finished work lived on |
| `WORKTREE` | Absolute path of the worktree that was removed, or empty when there was none |

A caller that holds none of these derives `PRIMARY_ROOT` with
`skills/pr-cleanup/SKILL.md` step 0 and `DEFAULT` with its step 1. Do not
hand-roll either derivation, and do not accept an unvalidated `PRIMARY_ROOT`:
every sink below aims a removal or an arbitrary command at it.

Shell state does not survive from one Bash invocation to the next. Every
invocation below re-derives what it uses in that same invocation, and every
expansion feeding a removal or a command uses the `${VAR:?}` form so an unset
value aborts instead of expanding to empty.

## The declaration: `.teamteardown`

A repo declares its own teardown. This skill never infers one — it cannot know
whether a database is disposable or whether a container holds the only copy of
something.

The declaration is a file named `.teamteardown` at the repository root:

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

The copy that runs is the one committed to the default branch:

```sh
git -C "${PRIMARY_ROOT:?}" show "origin/${DEFAULT:?}:.teamteardown" 2>/dev/null ||
  git -C "${PRIMARY_ROOT:?}" show "refs/heads/${DEFAULT:?}:.teamteardown" 2>/dev/null
```

The working-tree copy and the finished branch's copy are never read. This is
the load-bearing rule of the whole skill, and the review case is why: the
branch you just reviewed is, by definition, code that has not landed. A PR
that adds or edits `.teamteardown` would otherwise get its line executed by
the act of cleaning up after reading it — arbitrary code execution earned by
opening a pull request. On a fork PR against a public repo, that is anyone.
Reading from the default branch means the line ran through review before it
ran on the machine.

Both `git show` forms failing means the repo declares no teardown. That is the
common case and it is not an error: report that no declaration exists and move
to the temp-path sweep. Guard `PRIMARY_ROOT` and `DEFAULT` with standalone
`: "${VAR:?}"` statements *before* the substitution — a `:?` that fires inside
`$( )` kills only the subshell, so the assignment completes with an empty value
and the run reports "nothing declared" for a repo that declared plenty.

## Procedure

### Step 1 — run the declared teardown

Print each command before running it, so what executed is on the record:

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

`</dev/null` is not decoration. Without it a command that reads standard input
swallows the rest of the declaration out of the loop's pipe, and the remaining
lines silently never run — a teardown that reports success having done half
its work.

Lines run in file order. A failing line is reported loudly and the loop
continues: one broken teardown command must not strand the rest, and it must
never stop the caller's git teardown. If a line has not returned after roughly
120 seconds, kill it and report `TIMEOUT` rather than waiting it out.

### Step 2 — sweep recorded temp paths

Remove a temp path only when the run wrote it down. A caller that made scratch
under `$TMPDIR` records its absolute path in the artifact directory
(`docs/plans/<id>/`); this step reads those paths back. A caller that recorded
none has nothing to sweep here, and the report says so rather than going
looking.

Each recorded path passes three checks before `rm -rf` sees it. Strip trailing slashes
from the temp root first: on macOS `TMPDIR` is a `/var/folders/…/T/` path with
a trailing slash, and the unstripped prefix pattern matches nothing, so every
path would be refused as outside the temp root.

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

**Never wildcard-sweep the temp directory.** A pattern like
`rm -rf "$TMPROOT"/groom-backlog.*` cannot tell a dead run's directory from a
live one's — the names carry no session, no pid, and no clock. Deleting the
wrong one kills a run in progress, and the failure surfaces later as a missing
file with no cause attached. An unrecorded temp path is left on disk and named
in the report instead.

### Step 3 — report

Report per [Report](#report) below, then hand back to the caller.

## Finishing a review rather than a merge

A completed review usually leaves nothing on the machine: reading a diff on
GitHub creates no local state, and there is nothing to sweep. Say so and stop.

When a review did leave state — you checked out the author's branch, booted
their app, provisioned a database to run their tests — the two steps above run
unchanged, with one boundary that does not apply to your own merged work:

- The branch and the PR belong to someone else. Remove the local checkout if
  you made one, and nothing else. No `git push --delete`, no `gh pr close`, no
  branch deletion on origin.
- The default-branch read rule matters most here. The branch under review is
  unlanded code, so its `.teamteardown` is exactly the copy that must not run.

## Hard rules

1. **Never invent a teardown command.** No `.teamteardown` on the default
   branch means nothing runs. Guessing at `dropdb` or `docker rm` targets a
   resource whose disposability the repo never asserted.
2. **Never read `.teamteardown` from the working tree or from the finished
   branch.** Only the default-branch copy runs.
3. **Never edit, re-quote, or interpolate a declared line.** It runs verbatim;
   values reach it through `TEAM_*` in the environment.
   The general rule: `skills/principle-never-interpolate/SKILL.md`.
4. **Never guess credentials.** A teardown command that needs them reads them
   the way the repo's own tooling does. This skill does not open `.env` files
   and does not prompt for secrets.
5. **A failure here never blocks the caller.** Report it and continue; the git
   teardown proceeds either way.
6. **Never delete a temp path the run did not record**, and never a path
   outside `${TMPDIR:-/tmp}`, containing `..`, or reached through a symlink.
7. **Never re-run a step the caller owns** (see [Ownership
   boundary](#ownership-boundary)).

## Report

One line per thing that happened, and nothing else:

- Each declared command that ran, and its outcome — `ok`, `FAILED (exit N)`,
  or `TIMEOUT`.
- Each temp path removed.
- Each refusal, with the check that fired.
- `No .teamteardown on <default> — nothing declared.` when the file is absent,
  rather than silence that reads as a clean sweep.
- `No recorded temp paths.` when the caller recorded none.

Anything left on disk is named. A sweep that skipped something and did not say
so is indistinguishable from one that had nothing to do.
The general rule: `skills/principle-skip-loudly/SKILL.md`.
