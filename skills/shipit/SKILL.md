---
name: shipit
description: |
  Land a reviewed pull request: discover the open PR for the current branch,
  push any unpushed commits, wait for CI to go green, then squash-merge it so
  the PR title (which may carry a version) lands as the commit subject.
  Handles a PR that has fallen behind its base (rebase + force-with-lease) and
  surfaces branch-protection rejections verbatim. Project-agnostic — it knows
  nothing about how any project versions itself. Invoke ONLY on explicit ship
  intent — the user says "ship it", "land the PR", "land this", or runs
  "/shipit". Landing merges, which is irreversible: never infer ship intent
  from a PR merely being approved, green, or finished.
effort: medium
argument-hint: "[<pr-number>]"
---

# shipit — land a reviewed PR

> Follow `skills/progress-tracking/SKILL.md`: this procedure has more than two steps —
> seed one todo item per step below before starting and mark each complete as you go.

`shipit` lands a pull request that already passed review. It pushes any unpushed
local commits, waits for CI to go green, and squash-merges. The PR title then
lands as the commit subject on the base branch. If a project puts a version in
the title, that version shows up in `git log`. It
**finalizes an existing open PR**, and never opens one. It is generic, and it
does no versioning, changelog editing, or release work. If a project assigns a
version at land time, that happens in a separate project-specific step *before*
`/shipit` (in this repo, the dev `version-bump` skill — see
[docs/versioning.md](../../docs/versioning.md)). `shipit` only cares that the
branch is ready to land.

`gh pr merge` is irreversible, so two things guard it — neither of them a
frontmatter flag, and neither of them a question put to the user mid-run:

1. **Explicit ship intent.** The skill fires only on a direct "ship it" / "land
   the PR" / `/shipit`. An approved, green, or finished-looking PR is *not*
   ship intent — the user decides when to land.
2. **CI green** (step 3), which gates the merge mechanically — a red or timed
   out check stops the land before `gh pr merge` ever runs.

**Do not ask the user to confirm the merge.** Ship intent already carried the
authorization to merge, so a confirmation re-requests permission the invocation
granted, and every caller that chains into `/shipit` inherits the stop. Once
step 3 reports green, merge. The guard against merging the wrong thing is
refusing to start without ship intent, not stopping halfway through a land the
user asked for.

## Input acquisition

`shipit` lands the open PR for the **current branch**. Discover it with
`gh pr view --json baseRefName,number,state,title` and a base-branch fallback.
Never hardcode the base branch. The `title` is captured here because step 4
lands it as the squash commit subject. Run this in one bash call (an agent
thread resets cwd between calls):

```bash
PR_JSON=$(gh pr view --json number,baseRefName,state,title 2>/dev/null)
BASE=$(printf '%s' "$PR_JSON" | jq -r .baseRefName 2>/dev/null)
[ -z "$BASE" ] || [ "$BASE" = "null" ] && BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
[ -z "$BASE" ] && BASE=main
echo "PR: $PR_JSON"
echo "BASE: $BASE"
```

- **No open PR for the current branch** (`gh pr view` finds none): **refuse with
  a clear message** and stop. `shipit` finalizes an existing PR — it does not
  open one. Tell the user to open the PR first.
- **PR state is `MERGED` or `CLOSED`** (read from the discovery JSON above):
  **refuse up front** with a clear message before doing any work — there is
  nothing to land.
- An optional `<pr-number>` argument overrides the discovered PR.

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

Poll the PR's checks with `gh pr checks`. The bound is **mechanical, not prose**:
`timeout` enforces the total cap and `--fail-fast` exits the instant a check
fails. **Bounded, never infinite.** Defaults (overridable so a future automation
loop can tune them):

- **interval:** poll every 30s (`--interval 30`)
- **total timeout:** 30 min cap = 1800s (`timeout 1800`)

```bash
timeout 1800 gh pr checks <pr-number> --watch --fail-fast --interval 30
status=$?
```

`--fail-fast` returns non-zero the moment any check fails. `timeout` kills the
watch and returns **124** when the 30-min cap is hit. Map the exit code to one
of three outcomes:

- **`status` is 0** (all required checks passed) → continue to the merge. (Add
  `--required` to gate on required checks only. The default here gates on
  **all** checks so a failing optional check still halts the land — the
  conservative choice for an irreversible merge.)
- **`status` is non-zero and not 124** (a check failed) → **stop before merge**.
  Run `gh pr checks <pr-number>` to print the failing check, and report it by
  name. Leave the branch in place — the user fixes CI and re-runs `/shipit`. Do
  **not** merge.
- **`status` is 124** (the 30-min cap was hit and CI never went green) → stop
  and report "CI wait timed out". Do not merge.

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

## Completion

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
