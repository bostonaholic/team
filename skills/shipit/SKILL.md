---
name: shipit
description: |
  Land a reviewed pull request: discover the open PR for the current branch,
  push any unpushed commits, wait for CI to go green, then squash-merge it so
  the PR title (which may carry a version) lands as the commit subject.
  Handles a PR that has fallen behind its base (rebase + force-with-lease) and
  surfaces branch-protection rejections verbatim. Project-agnostic — it knows
  nothing about how any project versions itself. Use ONLY when the user
  explicitly says "ship it", "land the PR", "land this", or runs "/shipit";
  never auto-fire it — it merges, which is irreversible.
effort: medium
disable-model-invocation: true
argument-hint: "[<pr-number>] [--yes]"
---

# shipit — land a reviewed PR

> Follow `skills/progress-tracking/SKILL.md`: this procedure has more than two steps —
> seed one todo item per step below before starting and mark each complete as you go.

`shipit` lands a pull request that has already passed review: it pushes any
unpushed local commits, waits for CI to go green, and squash-merges so the PR
title lands as the commit subject on the base branch (if a project puts a
version in the title, that version then shows up in `git log`). It
**finalizes an existing open PR** — it never opens one. It is generic: it does
no versioning, changelog editing, or release work. If a project assigns a
version at land time, that happens in a separate project-specific step *before*
`/shipit` (in this repo, the dev `version-bump` skill — see
[docs/versioning.md](../../docs/versioning.md)); `shipit` only cares that the
branch is ready to land.

`gh pr merge` is irreversible, so this skill is **user-invocable only**
(`disable-model-invocation: true`): a human runs it deliberately; the model
never auto-fires it.

## Input acquisition

`shipit` lands the open PR for the **current branch**. Discover it with
`gh pr view --json baseRefName,number,state,title` and a base-branch fallback;
never hardcode the base branch. The `title` is captured here because step 5
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

The steps below are the **scriptable core**. The one interactive confirmation
(the pre-merge confirm in step 4) **wraps** it: a non-interactive caller passes
`--yes` to skip the prompt, leaving a pure push → wait → merge sequence.

### 1. Pre-flight merge-button check

Before relying on `--squash`, read the repo's merge strategy and report whether
squash merges are enabled. This is a **read-only** check, not enforcement:

```bash
gh repo view --json mergeCommitAllowed,rebaseMergeAllowed,squashMergeAllowed
```

Stop and report **only** if `squashMergeAllowed` is `false` — squash-merge is
how the PR title (and any version it carries) lands as the commit subject, and
it keeps linear history (a squash commit is a normal commit, not a merge
commit), so it is the only acceptable strategy here. If squash merging is
available, proceed regardless of which other methods (`mergeCommitAllowed`,
`rebaseMergeAllowed`) are enabled.

### 2. Push any unpushed local commits

The branch may carry commits made after the PR was opened (review fixups, a
project-specific land-time commit). Push them so CI runs against what will land:

```bash
git push
```

If the local branch and remote have diverged because the branch was rebased
locally, see the force-with-lease guidance in step 5 — never a bare `--force`.

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

`--fail-fast` returns non-zero the moment any check fails; `timeout` kills the
watch and returns **124** when the 30-min cap is hit. Map the exit code to one of
three outcomes:

- **`status` is 0** (all required checks passed) → continue to the merge. (Add
  `--required` to gate on required checks only; the default here gates on **all**
  checks so a failing optional check still halts the land — the conservative
  choice for an irreversible merge.)
- **`status` is non-zero and not 124** (a check failed) → **stop before merge**.
  Run `gh pr checks <pr-number>` to print the failing check, and report it by
  name. Leave the branch in place — the user fixes CI and re-runs `/shipit`. Do
  **not** merge.
- **`status` is 124** (the 30-min cap was hit and CI never went green) → stop and
  report "CI wait timed out"; do not merge.

**Re-entry after a CI fix:** when re-running `/shipit` after fixing CI, the
commits are already on the branch — `shipit` simply pushes any new ones, waits
again, and merges. It is safe to re-run.

### 4. Pre-merge confirmation

`gh pr merge` is irreversible. For a human operator, **ask for an explicit
confirmation** before merging — "about to merge PR #N into `<base>` — proceed?" —
and only merge on a yes. A non-interactive caller passes `--yes` to skip this
prompt; the prompt wraps the scriptable core, it does not live inside it.

### 5. Rebase if behind the base, then merge

**PR behind its base.** Before merging, check whether the base branch advanced
since CI last ran. If the PR is **behind `<base>`**, bring it up to date:

1. Rebase the branch onto the latest `<base>`.
2. `git push --force-with-lease` the rebased branch — the force is required
   because the rebase rewrote history; `--force-with-lease` refuses if the remote
   moved underneath you (**never a bare `--force`**).
3. Re-run the CI wait (step 3) against the rebased tree before merging.

**Merge with `gh pr merge --squash`** (named explicitly — squash lands the PR
title as the commit subject while keeping linear history, so it is the only
acceptable merge strategy here). Build the subject explicitly from the PR title
captured during discovery and append `(#<number>)` so every landed commit shows
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
  **verbatim** to the user; **never force** the merge.

## Completion

Report the merge result (or the failing-check / timeout / branch-protection
reason if it stopped short). If the project publishes a release on merge, that
runs asynchronously after the merge — point the operator at `gh run watch` (or
`gh run list`) so they can observe it rather than assuming it is already done.
