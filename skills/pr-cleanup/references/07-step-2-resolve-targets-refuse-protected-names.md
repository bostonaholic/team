### Step 2 — resolve targets, refuse protected names

If `$ARGUMENTS` named a PR, resolve its head branch from the `gh` JSON.
Otherwise use the argument as the branch name, or — with no argument —
fall back to `$INVOKE_BRANCH`, the branch step 0 captured from the
invoking directory. Never resolve the fallback through the anchored clone:
`branch --show-current` run against `$PRIMARY_ROOT` names the primary
clone's checkout (typically `$DEFAULT`), so a no-argument run from inside
a worktree — the common topology right after `/shipit` — would trip the
protected-name refusal below, or worse, target whatever branch the primary
clone happens to hold. However resolved, the name flows through the Input
allowlist, the protected-name refusal below, and the exact-case existence
check before any deletion. Once the invoking worktree is removed (Mode A
step 2 onward) the capture no longer names the target, so a later
invocation re-sets `$BRANCH` to the already-validated name — safe to set
literally, because the byte-exact allowlist proved it free of shell
metacharacters. Detect a stack from `gh` base-branch chains: a PR whose base branch
is another open PR's head belongs to a stack, and the whole chain becomes
the target set, child before parent. When a stack tool manages the branch
(for example Graphite), prefer that tool's delete command so its metadata
stays consistent. Known degradation: once a stack has merged, GitHub
rewrites each child PR's base to the default branch, so no open-PR chain
remains to walk — Mode A may resolve only the named branch, and the user
re-runs per branch. Nothing is destroyed by the degradation.

Refuse if any resolved name matches a protected name — the default branch
`$DEFAULT`, or `master`, `develop`, `release/*`, protected regardless of
which one is the default. The comparison is case-insensitive (Hard Rule
10): on a case-insensitive filesystem `Main` names the same branch as
`main`, `git check-ref-format` accepts it, and `git branch -D -- Main`
force-deletes `main`. Lowercase the candidate once and match:

```sh
# Guard as standalone statements, never inside $( ): a `:?` that fires in a
# command substitution kills only the subshell, and the parent carries on
# with an empty value straight into the pattern below.
: "${DEFAULT:?refusing: default branch unresolved — re-run step 1}"
: "${BRANCH:?refusing: no branch resolved — name the branch or its PR}"
LOWER="$(printf '%s' "$BRANCH" | tr '[:upper:]' '[:lower:]')"
DEFAULT_LOWER="$(printf '%s' "$DEFAULT" | tr '[:upper:]' '[:lower:]')"
case "$LOWER" in
  "$DEFAULT_LOWER"|master|develop|release/*)
    echo "refusing: '$BRANCH' matches the protected name '$LOWER' — name the feature branch or its PR explicitly" >&2; exit 1 ;;
esac
```

The guard must be the standalone `:` statement shown, ahead of the
lowering (Hard Rule 11's placement clause): `${DEFAULT:?}` nested inside
the `$( )` derivation aborts only that subshell, the assignment completes
with an empty `$DEFAULT_LOWER`, the first case pattern silently
vanishes, and `main` sails through while `master`/`develop`/`release/*`
still appear protected.

This refusal is intentional: protected branches are never cleanup
targets. When it fires, re-run with the feature branch or its PR named
explicitly; on a no-argument run it means the invoking checkout itself is
a protected branch, not the branch to clean up.
