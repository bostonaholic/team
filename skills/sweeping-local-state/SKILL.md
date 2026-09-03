---
name: sweeping-local-state
description: Remove only repo-declared local resources and recorded temp paths after authorized PR cleanup or review completion.
user-invocable: false
---

# Sweeping Local State

## Ownership boundary

This skill owns only provisioned resources and recorded temp paths. The caller
owns worktrees, refs, branches, `docs/plans/<id>/`, and stale worktree
directories. Never re-run a step the caller owns.

## Input

The caller supplies validated values:

| Variable | Value |
|---|---|
| `PRIMARY_ROOT` | absolute primary-clone path |
| `DEFAULT` | default branch |
| `BRANCH` | finished branch |
| `WORKTREE` | removed worktree's absolute path, or empty |

If absent, derive `PRIMARY_ROOT` and `DEFAULT` exactly as
`skills/pr-cleanup/SKILL.md` specifies. Shell state does not cross Bash calls;
each call re-derives its inputs and guards every removal/command sink.

## Declared teardown

`.teamteardown` at repo root contains one command per nonblank, non-comment
line. Commands run verbatim in file order from the repo root with:

- `TEAM_REPO_ROOT=$PRIMARY_ROOT`
- `TEAM_BRANCH=$BRANCH`
- `TEAM_WORKTREE=$WORKTREE`

Read only the default-branch version:

```sh
git -C "${PRIMARY_ROOT:?}" show "origin/${DEFAULT:?}:.teamteardown" 2>/dev/null ||
  git -C "${PRIMARY_ROOT:?}" show "refs/heads/${DEFAULT:?}:.teamteardown" 2>/dev/null
```

Both reads failing means nothing is declared; do not infer commands.

## Required actions

### 1. Run declared commands

```sh
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

The standalone guards must precede command substitution: `${VAR:?}` inside
`$(...)` aborts only the subshell. `</dev/null` prevents a command from
consuming later declaration lines. Print each command and result. Continue
after failure. Kill and report `TIMEOUT` after roughly 120 seconds. Teardown
failure never blocks the caller.

### 2. Sweep recorded temp paths

Read only absolute paths that this run recorded in its artifact directory.
For every path `P`:

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

Never wildcard-sweep the temp directory. Leave unrecorded paths and name them
in the report.

### 3. Report

Return one line for each command (`ok`, `FAILED (exit N)`, or `TIMEOUT`),
removed path, refusal, and item left on disk. When applicable, include exactly:

- `No .teamteardown on <default> — nothing declared.`
- `No recorded temp paths.`

## Finishing a review rather than a merge

If review created no local state, say so and stop. Otherwise run steps 1–2, but
remove only the local checkout you created. Never delete the author's remote
branch, close the PR, or delete an origin branch.

## Hard rules

1. Never invent a teardown command.
2. Never read `.teamteardown` from the working tree or from the finished
   branch; execute only the default-branch copy.
3. Never edit, re-quote, or interpolate a declared line. Pass values through
   `TEAM_*` (`skills/principle-never-interpolate/SKILL.md`).
4. Never open `.env`, guess credentials, or prompt for secrets.
5. Report failures and continue; never block caller teardown.
6. Never delete an unrecorded temp path, one outside `${TMPDIR:-/tmp}`, one
   containing `..`, or one reached through a symlink.
7. Never re-run a step the caller owns.

## Done

Every declared command and recorded temp path was attempted once under its
guards; every outcome and residue was reported
(`skills/principle-skip-loudly/SKILL.md`).
