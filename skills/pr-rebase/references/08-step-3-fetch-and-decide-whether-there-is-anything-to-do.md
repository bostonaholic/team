### Step 3 — fetch and decide whether there is anything to do

```sh
git fetch "${BASE_REMOTE:?}"
[ "${PUSH_REMOTE:?}" = "${BASE_REMOTE:?}" ] || git fetch "${PUSH_REMOTE:?}"   # refresh the lease ref too
MERGE_BASE="$(git merge-base HEAD "${BASE_REMOTE:?}/${BASE:?}")"   # against the base as it now stands
git rev-list --count "HEAD..${BASE_REMOTE:?}/${BASE:?}"    # commits the branch is behind by
git rev-list --count "${BASE_REMOTE:?}/${BASE:?}..HEAD"    # commits the branch is ahead by
```

Append `$MERGE_BASE` to the rebase log — step 5 reads it back to bound both
sides' history.

- **Behind count is 0** → the branch is already current. Report that and
  stop. Do not rebase to produce a no-op history rewrite.
- **Ahead count is 0** → there is nothing of yours to replay. Report it as a
  fast-forward, not a rebase, and stop; the user does not need this skill.
- **Someone else pushed to this branch.** `$REMOTE_SHA_BEFORE` is set and is
  not an ancestor of `HEAD`
  (`git merge-base --is-ancestor "$REMOTE_SHA_BEFORE" HEAD` fails) → stop.
  A force-push would destroy their commits. Report the divergence and let
  the user decide.
