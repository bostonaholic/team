## Land sequence

The steps below are the whole sequence, and they run end to end with no prompt
in the middle. Nothing here waits on a human.

### 1. Pre-flight merge-button check

Before relying on `--squash`, read the repo's merge strategy and report if
squash merges are enabled (a **read-only** check, not enforcement):

```bash
gh repo view --json mergeCommitAllowed,rebaseMergeAllowed,squashMergeAllowed
```

Stop and report **only** if `squashMergeAllowed` is `false`. If squash merging is
available, proceed regardless of which other methods (`mergeCommitAllowed`,
`rebaseMergeAllowed`) are enabled.

### 2. Run land-time versioning

Run the `version-bump` skill before pushing. It owns all version, changelog, and
title work and decides from project context whether the PR needs a bump.

- If it commits a bump, continue.
- If it reports no bump is required, continue with the plain PR title.
- If it stops for a stale bump, invalid state, missing project contract, or
  failed check, stop. Do not push, wait for CI, or merge.

`shipit` does not inspect changed files or edit version files itself.

### 3. Push any unpushed local commits

Push so CI runs against what will land:

```bash
git push
```

If the local branch and remote diverged because someone rebased the branch
locally, see the force-with-lease guidance in step 5. Never use a bare
`--force`.

### 4. Wait for CI

Three parts, in order: **settle**, **watch**, **verify**. The watch is not the
verdict: `gh pr checks --watch` exits when nothing is pending *right now*, and
exits 0 even before a push's checks attach or before a gated job spawns. The
verdict comes from GitHub's aggregate, which knows a check *suite* is still
running.

**4a — Settle.** Let the push's workflows register before watching. Run it
inline, not backgrounded: it is the short-wait exception in
[execution rules](../team/references/execution.md).

```bash
for _ in 1 2 3 4 5 6; do
  STATE=$(gh pr view <pr-number> --json mergeStateStatus --jq .mergeStateStatus)
  COUNT=$(gh pr view <pr-number> --json statusCheckRollup --jq '.statusCheckRollup | length')
  [ "$STATE" != "UNKNOWN" ] && [ "${COUNT:-0}" -gt 0 ] && break
  sleep 10
done
```

A repo with no CI leaves `COUNT` at 0 for the full minute. That is legitimate,
not a failure — fall through and let 4c decide.

**4b — Watch.** **Bounded, never infinite**: `timeout` enforces the total cap
and `--fail-fast` exits the instant a check fails. The defaults are overridable
so a future automation loop can tune them:

```bash
timeout 1800 gh pr checks <pr-number> --watch --fail-fast --interval 30
WATCH_STATUS=$?
```

**Run it with `run_in_background: true`.** In the foreground the harness kills
the watch at its own ceiling (600 s in Claude Code) with exit 143, so the 1800 s
cap applies only to a backgrounded call, whose real `WATCH_STATUS` the harness
reports when it exits. See [execution rules](../team/references/execution.md).

Map `WATCH_STATUS` first:

- **non-zero and not 124** (a check failed) → **stop before merge**. Run
  `gh pr checks <pr-number>` to print the failing check, and report it by name.
  Leave the branch in place — the user fixes CI and re-runs `/shipit`. Do
  **not** merge.
- **124** (the 30-min cap was hit and CI never went green) → stop and report
  "CI wait timed out". Do not merge.
- **0** → necessary, not sufficient. Continue to 4c.

**4c — Verify. This is the gate.** Read GitHub's aggregate for the head commit:

```bash
gh pr view <pr-number> --json mergeStateStatus --jq .mergeStateStatus
```

- **`CLEAN`** or **`HAS_HOOKS`** → CI is genuinely green. Merge.
- **`UNSTABLE`** → a suite is still running, or a check failed. Return to 4b
  and watch once more. **At most one re-watch**: a second `UNSTABLE` on the
  same head commit is a failure, not a race, so print `gh pr checks
  <pr-number>` and stop.
- **`BEHIND`** → the base moved. Take step 5's rebase path, then re-enter 4a.
- **`UNKNOWN`** → GitHub is still computing mergeability. Re-read once; stop if
  it does not resolve.
- **anything else** (`BLOCKED`, `DIRTY`, `DRAFT`, …) → stop and report the
  status verbatim. Never merge on a status this list does not name.

**Re-entry after a CI fix:** the commits are already on the branch, so a re-run
of `/shipit` pushes any new ones, waits again, and merges. It is safe to re-run.

### 5. Rebase if behind the base, then merge

**PR behind its base.** Before merging, check if the base branch advanced since
CI last ran. If the PR is **behind `<base>`**, bring it up to date:

1. Rebase the branch onto the latest `<base>`.
2. `git push --force-with-lease` the rebased branch (**never a bare
   `--force`**).
3. Re-run the CI wait (step 4) against the rebased tree before merging.

**Merge with `gh pr merge --squash`**, named explicitly: squash lands the PR
title as the commit subject and keeps linear history, so it is the only
acceptable merge strategy here. Build the subject explicitly from the PR title
captured during discovery, so the repo's default squash commit message setting
cannot replace it, and append `(#<number>)` yourself — an explicit `--subject`
is **not** auto-suffixed with the PR number:

```bash
TITLE=$(printf '%s' "$PR_JSON" | jq -r .title)
gh pr merge <pr-number> --squash --subject "$TITLE (#<pr-number>)"
```

Leave the squash body (by default the concatenated commit messages) as-is
unless the operator asks otherwise.

- On a **branch-protection rejection**, surface GitHub's rejection message
  **verbatim** to the user. **never force** the merge.

Report the merge result, or the reason it stopped short: a failing check, a
timeout, or branch protection. If the project publishes a release on merge, it
runs asynchronously: point the operator at `gh run watch` or `gh run list`
rather than assume it is already done.

**On a merge that landed, run `/pr-cleanup`. Do not stop to recommend it.**
Two limits hold:

- **Only a landed merge reaches cleanup.** A run that stopped at a failing
  check, at the CI timeout, or at a branch-protection rejection merged
  nothing, and `/pr-cleanup` must not run.
- **Only Mode A is reachable this way.** Mode B (closed / abandoned) stays
  user-triggered: an explicit abandon request is its only gate, and this
  chaining never reaches it.

`shipit` touches no tracker or board — it stays generic.
