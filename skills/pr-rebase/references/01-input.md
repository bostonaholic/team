## Input

`$ARGUMENTS` is optional and carries scalars only:

- **A PR number (digits only) or a full PR URL.** Used to resolve the base
  branch, and to report which PR the rebase updates. It does **not** select
  which branch is rebased — the branch is always the current checkout, so a
  PR argument that names a different head branch is a refusal, not a
  checkout.

**The base branch is discovered, never assumed.** Resolve it through the
fallback chain, in one bash call (an agent thread resets cwd between calls).
**When `$ARGUMENTS` supplied a PR, that selector is passed to `gh pr view`** —
omitting it silently resolves the *current branch's* PR instead, so a run
invoked with an explicit PR would measure against the wrong base:

```bash
# PR="" when no PR argument was given; digits-only or a full URL otherwise.
case "$PR" in
  ''|*[!0-9]*) [ -n "$PR" ] && case "$PR" in https://*) : ;; *) echo "refusing: PR must be digits-only or a full URL" >&2; exit 1 ;; esac ;;
esac
if [ -n "$PR" ]; then
  # An explicitly named PR is authoritative: it resolves the base or the run stops.
  BASE=$(gh pr view "$PR" --json baseRefName -q .baseRefName) \
    || { echo "refusing: cannot resolve PR '$PR' — check the number/URL and 'gh auth status'" >&2; exit 1; }
  [ -n "$BASE" ] || { echo "refusing: PR '$PR' returned no base branch" >&2; exit 1; }
else
  BASE=$(gh pr view --json baseRefName -q .baseRefName 2>/dev/null)
  [ -z "$BASE" ] && BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
  [ -z "$BASE" ] && BASE=main
fi
git rev-parse --abbrev-ref HEAD
```

**The fallback chain exists only for the no-PR case.** With no argument, a
`gh` failure (unauthenticated, no PR for this branch, offline) is not an
error — the chain degrades to `origin/HEAD` and then to `main`, and the run
reports which tier supplied the base. With a PR named explicitly, there is
no degradation: the lookup succeeds or the run refuses. Falling through
would silently rebase onto `main` while the user believes the run is
tracking the PR they named — and on a PR whose base is a stack parent or a
release branch, that quietly rewrites the branch onto the wrong history.

**Every externally sourced branch name** — a PR's `baseRefName` or
`headRefName`, a user argument — passes a character allowlist before it
reaches any command: only `^[A-Za-z0-9._/-]+$`, with no leading `-` and no
`..`. Set `LC_ALL=C` in the same invocation so the class is byte-exact
(`principle-never-interpolate`; the full collation rationale
stays in `skills/pr-cleanup/SKILL.md` `## Input`):

```sh
LC_ALL=C
case "$BASE" in
  ''|-*|*..*|*[!A-Za-z0-9._/-]*)
    echo "refusing: unsafe base branch name — name the base explicitly" >&2; exit 1 ;;
esac
```

`git check-ref-format --branch "$BASE"` is a further ref-syntax check, not a
shell control — only the allowlist makes a name safe to place in a command.
Capture an external name into a variable in the SAME invocation that uses it
and reference it only as `"$BASE"`, never as a pasted literal
(`principle-never-interpolate`; the sharper full rationale
stays in `skills/pr-cleanup/SKILL.md`).
