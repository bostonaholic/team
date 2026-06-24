---
topic: pr-title-sync-stale-base
date: 2026-06-24
phase: task
ticketId: "104"
---

# Bug: pr-title-sync re-stamps a stale base version onto PRs behind a bumped main

GitHub issue: https://github.com/bostonaholic/team/issues/104

## Summary

`.github/workflows/pr-title-sync.yml` (job *Sync PR title to version*) rewrites a
PR's title to `v<stale-version>` when the PR branch is behind a `main` that has had
version bumps since the branch forked. It keeps re-stamping even after a maintainer
strips the prefix, so a bump-less PR cannot hold a version-free title until it is
rebased to parity with `main`.

## Root cause

The no-op guard compares two inconsistent snapshots of the base:

- `V` is read from the checked-out tree, which on a `pull_request` event is the
  **merge ref** (`branch ⊕ base`). GitHub recomputes the merge ref lazily, so when
  `main` is bumping rapidly and the PR is behind, the cached merge-ref base **lags**
  the live base.
- `BASE_V` is read from a **fresh** fetch of the live base tip.

For a bump-less PR these should cancel out, but the lag makes them disagree, the
`V == BASE_V` guard misses, and the workflow stamps a version unrelated to the PR.

## Fix (per issue)

Decide "the version this PR ships" from what the branch itself changed:

- Read the candidate version from the **PR head** (`head.sha`), not the merge ref.
- Compare it against the **merge-base** (fork point) version, not the live base tip.
- Only rewrite the title on a **strict forward bump** over the merge-base; else no-op.

Preserve loop-safety (the `edited` re-entry no-ops) and the same-repo-only `if:` guard.
