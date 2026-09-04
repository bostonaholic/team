---
name: sweeping-local-state
description: 'Defines machine-local teardown. Load when finishing a PR or review that leaves provisioned local state.'
user-invocable: false
---

# Sweeping Local State

Remove only provisioned resources and recorded temp paths. Read
[references/procedure.md](references/procedure.md). `skills/pr-cleanup/SKILL.md` and `worktree-isolation` own git state.

## Ownership boundary

This skill owns databases, containers, queues, buckets, caches, and recorded
temp paths. Never re-run a step the caller owns: worktrees, branches, refs,
`docs/plans/<id>/`, or stale worktree directories.

Inputs: validated absolute `PRIMARY_ROOT`, `DEFAULT`, `BRANCH`, and optional
`WORKTREE`. Derive missing repo/default values through `pr-cleanup` steps 0/1.

## `.teamteardown`

Only the default-branch copy can run. Never read `.teamteardown` from the working tree or from the finished
branch. Try:

```sh
git -C "${PRIMARY_ROOT:?}" show "origin/${DEFAULT:?}:.teamteardown" 2>/dev/null ||
  git -C "${PRIMARY_ROOT:?}" show "refs/heads/${DEFAULT:?}:.teamteardown" 2>/dev/null
```

Guard and execute in one shell invocation:

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

Run lines verbatim in file order. Report failures and continue. Kill and report
`TIMEOUT` after roughly 120 seconds. **Never invent a teardown command.**
**Never edit, re-quote, or interpolate a declared line**
(`principle-never-interpolate`). Never guess credentials.

## Recorded temp paths

For each recorded absolute `P`, run these guards before removal:

```sh
TMPROOT="${TMPDIR:-/tmp}"
while [ "${TMPROOT%/}" != "$TMPROOT" ]; do TMPROOT="${TMPROOT%/}"; done
case "$P" in "$TMPROOT"/?*) ;; *) echo "refusing: '$P' is not under $TMPROOT" >&2; continue ;; esac
case "$P" in *..*) echo "refusing: '$P' contains '..'" >&2; continue ;; esac
[ -L "$P" ] && { echo "refusing: '$P' is a symlink" >&2; continue; }
rm -rf "${P:?}"
```

Never wildcard-sweep the temp directory. Never delete an unrecorded path.

## Finishing a review rather than a merge

If the review created no local state, report that and stop. Otherwise run the
same two steps, but remove only local checkout state you created. Never delete
the author's remote branch, close the PR, or run unlanded `.teamteardown`.

## Report

Report each command outcome (`ok`, `FAILED (exit N)`, or `TIMEOUT`), removed path,
refusal, and leftover. Use `No .teamteardown on <default> — nothing declared.` or
`No recorded temp paths.` when applicable. Never block caller teardown (`principle-skip-loudly`).
