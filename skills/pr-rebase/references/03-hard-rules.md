## Hard rules

1. **Never push without the verification gate.** A regression (step 6) or an
   unresolved escalation (step 5) stops the run before step 7. There is no
   ungated path to the remote.
2. **Never overwrite remote work you have not seen.** The rule is an
   invariant, not a command: at publish time the remote tip must be verified
   equal to `$REMOTE_SHA_BEFORE` (step 2), and the publish must fail rather
   than overwrite if it moved. The default realization is plain git —
   `--force-with-lease=<branch>:<pre-fetch-sha>` plus `--force-if-includes`,
   aimed at `$PUSH_REMOTE` — and a bare `git push --force` is never it. A
   plain `--force-with-lease` is **not** sufficient here either: this skill
   runs `git fetch` in step 3, which advances the remote-tracking ref the
   implicit lease reads, so the lease would happily clobber a teammate's push
   that we fetched but never integrated. Nor is a hardcoded `origin`
   sufficient: the remote comes from the branch's own upstream (step 0),
   because on a fork PR `origin` can be the upstream repository. When the
   repo's publishing is owned by a stack manager (step 0), delegating the
   push to it satisfies this rule only after the explicit lease check in
   step 7 has verified the remote tip unchanged.
3. **Never `git rebase --skip`.** It drops the conflicting commit entirely.
   A conflict is resolved or the rebase is aborted; it is never skipped.
4. **Every resolution keeps both sides' intent.** Taking one side whole is
   a valid resolution exactly when it does that — when one side's change is
   literally contained in the other. `git checkout --ours`
   and `--theirs` are reserved for generated files, and even there the
   correct action is to regenerate, not to pick (step 5).
5. **Never touch uncommitted tracked work.** A dirty tree stops the run
   before the rebase starts (step 1). Do not stash on the user's behalf.
6. **Never rebase a protected branch.** The default branch, `master`,
   `develop`, and `release/*` are refused as the *rebase target* (step 1).
7. **Never assume the base is `main`** — detect it through the chain above.
8. **The recovery anchor is captured before anything is rewritten** and
   reported at every stop (step 2). A run that leaves the user unable to say
   `git reset --hard <sha>` has failed even if the rebase succeeded.
9. **A check with no baseline proves nothing after.** A check that could not
   run before the rebase is reported `UNKNOWN`, never counted as evidence
   that behavior was preserved (step 2). When *every* check is `UNKNOWN`, the
   run verified nothing at all: the publish proceeds on the invocation's
   authority, but it is reported as unverified in exactly those words —
   never as checks matching a baseline (step 7).
   Rules 8 and 9 are `principle-pre-image-first`: capture
   the baseline and the recovery anchor before anything is rewritten.
10. **No destructive command relies on a variable set in an earlier Bash
    invocation.** Shell state does not persist between invocations: the
    publish and any `git reset --hard` re-derive `$BRANCH`, `$BASE`, `$PUSH_REMOTE`,
    and `$ORIG_SHA` in the same invocation (re-reading the rebase log from step
    2 when needed) and expand them as `${VAR:?}` so an unset variable aborts
    instead of expanding to empty.
