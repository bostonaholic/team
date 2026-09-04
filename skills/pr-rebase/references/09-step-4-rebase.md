### Step 4 — rebase

```sh
git rebase "${BASE_REMOTE:?}/${BASE:?}"
```

If the branch contains merge commits
(`git rev-list --merges --count "$BASE_REMOTE/$BASE..HEAD"` is non-zero), use
`git rebase --rebase-merges "$BASE_REMOTE/$BASE"` instead — a plain rebase
flattens the topology and can silently drop a merge's second parent.

A clean rebase goes straight to step 6. A conflict enters step 5.

**A branch with tracked children is a stack, not a lone branch.** When the
publisher is a stack manager and the branch has tracked children, the rebase
just moved their parent out from under them, and they are orphaned unless
they are restacked. Once the rebase completes cleanly (or step 5 resolves
its last conflict), cascade with the manager's own restack — `gt restack`
restacks this branch's descendants onto the new history — and report which
branches moved. The cascade is scoped to this branch's own descendants: an
unrelated sibling branch that also needs restacking is not this run's to
touch.
