---
name: shipit
description: |
  Land an existing reviewed pull request: push, wait for CI, squash-merge,
  then hand off explicit cleanup. Trigger on "ship it", "land the PR",
  "land this", or "/shipit". Invoke ONLY on explicit ship intent; approval,
  green CI, or finished work is not ship intent.
effort: medium
argument-hint: "<pr-number-or-url>"
disable-model-invocation: true
---

# shipit

Call the Skill tool with `principle-progress-tracking` and follow it.

Finalizes one existing open PR. It never opens a PR, versions a project,
edits a changelog, creates a release, or moves a tracker ticket. Explicit
invocation authorizes the merge; do not ask again immediately before it.

## Procedure

### 1. Resolve and validate the PR

Validate `$ARGUMENTS` before the first PR read:

```bash
node "<skill-dir>/scripts/merge-state.mjs" target
```

Send raw arguments on stdin. Resolve the helper's `target`; non-zero stops.
Read canonical identity and state together:

```bash
gh pr view "$TARGET" \
  --json number,url,baseRefName,state,title,headRefName,headRepository
```

Pass the resolved PR fields on stdin to
`node "<skill-dir>/scripts/merge-state.mjs" head`. The helper reads the
current branch, configured push URLs, and fetch remotes from the checkout. Use
its canonical URL, base repository and branch, current branch, single push URL
and remote, and base remote. It requires `OPEN` state and valid base/head refs.
An ambiguous push URL, mismatch, or unprovable fork stops before writes.

Confirm squash merging is allowed before spending time on CI:

```bash
gh repo view "$BASE_REPOSITORY" --json squashMergeAllowed --jq .squashMergeAllowed
```

If false, stop and report that this skill requires squash merge. Do not
substitute another merge strategy.

### 2. Publish local commits

```bash
git push "${PUSH_REMOTE:?}" "${BRANCH:?}"
REMOTE_REF="$(git ls-remote --heads "${PUSH_URL:?}" "refs/heads/${BRANCH:?}")" ||
  { echo "cannot read the exact push target" >&2; exit 1; }
REMOTE_SHA_BEFORE="$(printf '%s\n' "$REMOTE_REF" | cut -f1)"
[ "$REMOTE_SHA_BEFORE" = "$(git rev-parse HEAD)" ] ||
  { echo "push target does not match local HEAD" >&2; exit 1; }
```

Surface a push rejection verbatim and stop. Require the remote read to contain
exactly one line and one 40-hex SHA.

### 3. Wait for CI

First let GitHub settle: read `mergeStateStatus` and `statusCheckRollup` up to
six times, 10 seconds apart. Carry the helper's `zeroCheckReads` from zero and,
after each read, pass `{attempt, mergeStateStatus, checksComplete, checkCount,
zeroCheckReads}` as JSON on stdin to
`node "<skill-dir>/scripts/merge-state.mjs" settle`. Stop when `settled` or
`exhausted`. Zero checks never settles early; it reaches attempt six so GitHub
has the full settling window.

If and only if attempt six returns `skipCheckWatch: true`, report that no checks
are configured and continue without invoking `gh pr checks`. Otherwise run one
bounded background wait:

```bash
timeout 1800 gh pr checks "$PR_URL" --watch --fail-fast --interval 30
```

Use `run_in_background: true` per
`skills/principle-non-blocking-waits/SKILL.md`. Exit `0` continues; `124`
is a 30-minute timeout; any other non-zero status is a failed check. Stop
and report the failing or timed-out checks.

### 4. Re-read mergeability

After CI, fetch `mergeStateStatus`. Pass it with `behindRebases`,
`unstableRetries`, and `unknownRetries` (all initially zero) as JSON on stdin to
`node "<skill-dir>/scripts/merge-state.mjs" mergeability`. `merge` continues;
`retry-ci` repeats the CI wait once; `reread` reads once; `rebase` runs the
procedure below once, increments `behindRebases`, and restarts CI settling;
`stop` reports the state verbatim. A second `BEHIND` result stops.

For `BEHIND`, fetch and rebase onto the recorded base, then publish only
with a lease:

```bash
git fetch "${BASE_REMOTE:?}" "${BASE:?}"
git rebase "${BASE_REMOTE:?}/${BASE:?}"
git push --force-with-lease="${BRANCH:?}:${REMOTE_SHA_BEFORE:?}" \
  "${PUSH_REMOTE:?}" "${BRANCH:?}"
```

The lease names the exact SHA read from `pushUrl` before rebase. Never use bare
`--force` or a tracking-ref-only lease. On conflicts, stop with the rebase intact and
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

Do not invoke another mutating skill. Cleanup requires its own explicit user
invocation. After a successful merge, report:

- PR URL and merge result;
- CI result and any behind-base rebase;
- cleanup was not run and **Next: run `/pr-cleanup merged <PR URL>`**;
- release status only as an observation when the repository exposes a
  release workflow. Do not create or repair a release.
