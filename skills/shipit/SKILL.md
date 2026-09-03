---
name: shipit
description: |
  Land an existing reviewed pull request: push, wait for CI, squash-merge,
  then clean up. Trigger on "ship it", "land the PR", "land this", or
  "/shipit". Invoke ONLY on explicit ship intent; approval, green CI, or
  finished work is not ship intent.
effort: medium
argument-hint: "[<pr-number>]"
---

# shipit

Call the Skill tool with `principle-progress-tracking`.

Finalizes one existing open PR. It never opens a PR, versions a project,
edits a changelog, creates a release, or moves a tracker ticket. Explicit
invocation authorizes the merge; do not ask again immediately before it.

## Procedure

### 1. Resolve and validate the PR

Pass the exact `$ARGUMENTS` as stdin data to
`node "<skill-dir>/scripts/merge-state.mjs" target`; never put it in shell text
or argv. Non-zero stops; null selects the current branch. Use only the returned
number for one of:

```bash
gh pr view --json url,number,baseRefName,state,title,headRefName,headRefOid,headRepository,headRepositoryOwner
gh pr view "$PR_NUMBER" --json url,number,baseRefName,state,title,headRefName,headRefOid,headRepository,headRepositoryOwner
```

Pass that JSON as stdin to `node "<skill-dir>/scripts/merge-state.mjs" bind`.
Non-zero stops. The helper requires the current branch to equal `headRefName`
and every configured push URL to identify the PR's head repository, including
forks. Use only its canonical URL, base identity, branch, head identity/OID,
remotes, and validated push URL afterward.

If there is no argument and no branch PR, resolve the base from
`origin/HEAD`, then `main`, only to report the failure. Stop when no PR
exists or its state is `MERGED` or `CLOSED`.

Confirm squash merging is allowed before spending time on CI:

```bash
gh repo view "$OWNER/$REPO" --json squashMergeAllowed --jq .squashMergeAllowed
```

If false, stop and report that this skill requires squash merge. Do not
substitute another merge strategy.

### 2. Publish local commits

```bash
git push -- "${PUSH_REMOTE:?}" "${CURRENT_BRANCH:?}:${HEAD_REF_NAME:?}"
```

Surface a push rejection verbatim and stop.

### 3. Wait for CI

First let GitHub settle: read `mergeStateStatus` and `statusCheckRollup` from
`gh pr view "$PR_URL"` up to six times, 10 seconds apart. After each read,
pass `{attempt, mergeStateStatus, checkCount}` as JSON on stdin to
`node "<skill-dir>/scripts/merge-state.mjs" settle`. End settling on `settled`
or `exhausted`. Obey its action: `watch` runs the check watcher; `skip-checks`
means six stable reads found no configured checks and continues without it;
`stop` reports an unresolved GitHub state. Zero checks never settles early.

For `watch`, run one bounded background wait:

```bash
timeout 1800 gh pr checks "$PR_URL" --watch --fail-fast --interval 30
```

Use `run_in_background: true` per
`skills/principle-non-blocking-waits/SKILL.md`. Exit `0` continues; `124`
is a 30-minute timeout; any other non-zero status is a failed check. Stop
and report the failing or timed-out checks.

### 4. Re-read mergeability

After CI, fetch `mergeStateStatus` from `gh pr view "$PR_URL"`. Pass it with
`unstableRetries`, `unknownRetries`, and `behindRebases` as JSON on stdin to
`node "<skill-dir>/scripts/merge-state.mjs" mergeability`. `merge` continues;
`retry-ci` repeats the CI wait once; `reread` reads once; `rebase` runs the
procedure below and restarts CI settling once; `stop` reports the state
verbatim. Increment `behindRebases` before restarting; a second `BEHIND`
result stops.

For `BEHIND`, first re-read
`url,state,mergeStateStatus,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner`.
Pass the bound `{pushUrl, pushRepository: headRepository, branch}` as JSON
stdin to `node "<skill-dir>/scripts/merge-state.mjs" remote-head`, and read
the local `HEAD`. Then pass the original binding, fresh PR metadata, local
head, and returned remote SHA as JSON stdin to
`node "<skill-dir>/scripts/merge-state.mjs" rebase-preflight`. Non-zero
stops. This mechanically requires the same canonical open PR, unchanged base,
head branch and repository, `BEHIND` state, and one identical valid head OID
from GitHub, local Git, and the validated push URL. Save its
`remoteShaBefore`; it is the exact pre-rebase lease value.

Fetch and rebase onto the recorded base, then publish with that exact lease:

```bash
git fetch "${BASE_REMOTE:?}" "$BASE"
git rebase "${BASE_REMOTE:?}/$BASE"
git push --force-with-lease="refs/heads/${HEAD_REF_NAME:?}:${REMOTE_SHA_BEFORE:?}" \
  -- "${PUSH_REMOTE:?}" \
  "${CURRENT_BRANCH:?}:${HEAD_REF_NAME:?}"
```

Never use bare `--force` or a tracking-ref-only lease. On conflicts, stop with the rebase intact and
name the files; do not guess or skip commits. See
[`references/behind-base.md`](references/behind-base.md) for recovery.

### 5. Merge

Re-read the PR title immediately before merging. Preserve GitHub's default
squash body and set the subject to the title plus PR number. Do not supply a
custom merge body: GitHub's generated body must retain any `Closes #...`
directives so linked issues close on merge.

```bash
TITLE="$(gh pr view "$PR_URL" --json title --jq .title)"
gh pr merge "$PR_URL" --squash --subject "$TITLE (#$PR_NUMBER)"
```

This is the irreversible terminal action. Run it only because the user
explicitly invoked this skill. Surface branch-protection or merge failures
verbatim; never force past them.

## Completion

Only after a successful merge, run `/pr-cleanup <canonical PR URL>` in Mode A
automatically.
Never clean up after a stop and never run Mode B automatically. Report:

- PR URL and merge result;
- CI result and any behind-base rebase;
- cleanup result, including skips or failures;
- release status only as an observation when the repository exposes a
  release workflow. Do not create or repair a release.
