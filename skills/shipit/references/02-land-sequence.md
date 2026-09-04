## Land sequence

The steps below are the whole sequence, and they are **scriptable end to end**:
a pure push → wait → merge with no prompt in the middle. Nothing here waits on a
human.

### 1. Pre-flight merge-button check

Before relying on `--squash`, read the repo's merge strategy and report if
squash merges are enabled. This is a **read-only** check, not enforcement:

```bash
gh repo view --json mergeCommitAllowed,rebaseMergeAllowed,squashMergeAllowed
```

Stop and report **only** if `squashMergeAllowed` is `false`. Squash-merge is how
the PR title, and any version it carries, lands as the commit subject. It also
keeps linear history, because a squash commit is a normal commit and not a merge
commit. It is thus the only acceptable strategy here. If squash merging is
available, proceed regardless of which other methods (`mergeCommitAllowed`,
`rebaseMergeAllowed`) are enabled.

### 2. Push any unpushed local commits

The branch may carry commits made after the PR was opened (review fixups, a
project-specific land-time commit). Push them so CI runs against what will land:

```bash
git push
```

If the local branch and remote diverged because someone rebased the branch
locally, see the force-with-lease guidance in step 4. Never use a bare
`--force`.

### 3. Wait for CI

Three parts, in order: **settle**, **watch**, **verify**. The watch is how the
wait is spent cheaply. It is not the verdict.

**Why the watch cannot be the verdict.** `gh pr checks --watch` exits when
nothing is pending *right now*, and two different states produce that: every
check finished, and no check has started yet. An exit code cannot tell them
apart. Just after a push, workflows take seconds to attach to the head commit,
so a watch started too early sees an empty or partial check set, calls it done,
and exits 0 — a green light on CI that never ran. Checks also appear mid-run: a
job gated on another job does not exist until that one finishes, so "nothing
pending" can be premature long after the push. The verdict therefore comes from
GitHub's own aggregate, which knows a check *suite* is still running even when
every job it has created so far has passed.

**3a — Settle.** Let the push's workflows register before watching. This is the
wait shorter than a turn's overhead that
`principle-non-blocking-waits` names as its exception, so it
runs inline rather than backgrounded:

```bash
for _ in 1 2 3 4 5 6; do
  STATE=$(gh pr view <pr-number> --json mergeStateStatus --jq .mergeStateStatus)
  COUNT=$(gh pr view <pr-number> --json statusCheckRollup --jq '.statusCheckRollup | length')
  [ "$STATE" != "UNKNOWN" ] && [ "${COUNT:-0}" -gt 0 ] && break
  sleep 10
done
```

A repo with no CI leaves `COUNT` at 0 for the full minute. That is a legitimate
outcome, not a failure — fall through and let 3c decide.

**3b — Watch.** The bound is **mechanical, not prose**: `timeout` enforces the
total cap and `--fail-fast` exits the instant a check fails. **Bounded, never
infinite.** Defaults (overridable so a future automation loop can tune them):

- **interval:** poll every 30s (`--interval 30`)
- **total timeout:** 30 min cap = 1800s (`timeout 1800`)

```bash
timeout 1800 gh pr checks <pr-number> --watch --fail-fast --interval 30
status=$?
```

**Run it with `run_in_background: true`.** The 1800s cap only applies to a
backgrounded call: in the foreground the harness kills the watch at its own
ceiling (600 s in Claude Code) with exit 143, so on any repo whose CI runs
longer than ten minutes the stated 30-minute cap never applies and the watch
is lost rather than timed out. Backgrounded, the harness reports the call when
it exits and `status` is the real verdict. See
`principle-non-blocking-waits`.

Map `status` first — it is the fast path out, never the way in:

- **non-zero and not 124** (a check failed) → **stop before merge**. Run
  `gh pr checks <pr-number>` to print the failing check, and report it by name.
  Leave the branch in place — the user fixes CI and re-runs `/shipit`. Do
  **not** merge.
- **124** (the 30-min cap was hit and CI never went green) → stop and report
  "CI wait timed out". Do not merge.
- **0** → necessary, not sufficient. Continue to 3c.

**3c — Verify. This is the gate.** Read GitHub's aggregate for the head commit:

```bash
gh pr view <pr-number> --json mergeStateStatus --jq .mergeStateStatus
```

- **`CLEAN`** or **`HAS_HOOKS`** → CI is genuinely green. Merge.
- **`UNSTABLE`** → a suite is still running, or a check failed. Return to 3b
  and watch once more. **At most one re-watch**: a second `UNSTABLE` on the
  same head commit is a failure, not a race, so print `gh pr checks
  <pr-number>` and stop.
- **`BEHIND`** → the base moved. Take step 4's rebase path, then re-enter 3a.
- **`UNKNOWN`** → GitHub is still computing mergeability. Re-read once; stop if
  it does not resolve.
- **anything else** (`BLOCKED`, `DIRTY`, `DRAFT`, …) → stop and report the
  status verbatim. Never merge on a status this list does not name.

**Re-entry after a CI fix:** when re-running `/shipit` after fixing CI, the
commits are already on the branch — `shipit` simply pushes any new ones, waits
again, and merges. It is safe to re-run.

### 4. Rebase if behind the base, then merge

**PR behind its base.** Before merging, check if the base branch advanced since
CI last ran. If the PR is **behind `<base>`**, bring it up to date:

1. Rebase the branch onto the latest `<base>`.
2. `git push --force-with-lease` the rebased branch — the force is necessary
   because the rebase rewrote history. `--force-with-lease` refuses if the
   remote moved underneath you (**never a bare `--force`**).
3. Re-run the CI wait (step 3) against the rebased tree before merging.

**Merge with `gh pr merge --squash`**, named explicitly. Squash lands the PR
title as the commit subject and keeps linear history, so it is the only
acceptable merge strategy here. Build the subject explicitly from the PR title
captured during discovery. Append `(#<number>)`, so every landed commit shows
both the title (with any version it carries) and the PR number — exactly the
`git log` shape the operator sees. Passing `--subject` is deliberate: it
guarantees the PR title regardless of the repo's "default squash commit message"
setting (an explicit `--subject` is **not** auto-suffixed with the PR number, so
we add it ourselves):

```bash
TITLE=$(printf '%s' "$PR_JSON" | jq -r .title)
gh pr merge <pr-number> --squash --subject "$TITLE (#<pr-number>)"
```

The squash body defaults to the concatenated commit messages — leave it as-is
unless the operator asks otherwise.

- On a **branch-protection rejection**, surface GitHub's rejection message
  **verbatim** to the user. **never force** the merge.

Report the merge result. If it stopped short, report the reason: a failing
check, a timeout, or branch protection. If the project publishes a release on
merge, that runs asynchronously after the merge. Point the operator at
`gh run watch`, or `gh run list`, so they can observe it rather than assume it
is already done.

**On a merge that landed, run `/pr-cleanup`. Do not stop to recommend it.**
The merge already happened. A resync of the default branch and a delete of
the merged branch carry no decision. `/pr-cleanup` **Mode A** verifies the
merged PR first, by identity and by containment, before it deletes anything.
A handoff line here costs the operator a second command for no decision.

Two limits hold, and both are load-bearing:

- **Only a landed merge reaches cleanup.** A run that stopped at a failing
  check, at the CI timeout, or at a branch-protection rejection merged
  nothing. No merged branch exists to remove. `/pr-cleanup` must not run.
- **Only Mode A is reachable this way.** Mode B (closed / abandoned) deletes
  remote branches, worktrees, and planning scratch by force. An explicit
  abandon request is its only gate. It stays user-triggered, and this
  chaining never reaches it.

`shipit` touches no tracker or board — it stays generic. If the PR links a
ticket (e.g. `Closes #<n>`), the tracker closes that ticket when the merge
lands, and any board automation moves it to its done state on its own. That is a
property of the link the PR phase added, not an action `shipit` performs.
