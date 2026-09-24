---
name: pr-rebase
description: 'Use for branch rebases only on explicit request. Never infer from a behind branch. Rebases onto the branch base.'
effort: high
argument-hint: "[<pr-number-or-url>]"
disable-model-invocation: true
---

# pr-rebase — rebase onto the latest base

Fetch the base, rebase the current branch onto it, resolve conflicts from both
sides' intent, and confirm the branch still works before publishing it.

- **Base.** Resolve it from `$ARGUMENTS` when that names a PR number or URL —
  a failed lookup stops the run — otherwise from the repository's default
  branch (`git symbolic-ref refs/remotes/origin/HEAD`), then `main`. Fetch it
  from `origin`, or from the remote that owns the base repository when they
  differ. The argument selects the base only; the branch rebased is always the
  current checkout.
- **Pre-flight.** Refuse to start on a dirty tracked tree, a rebase or merge
  already in progress, or a checkout of the base branch itself. Record
  `git rev-parse HEAD` as the recovery point, report `git reset --hard <sha>`
  whenever the run stops, and run the project's checks once, keeping each
  result.
- **Rebase** the checkout onto the fetched base, with `--rebase-merges` when
  the branch contains merge commits. On a conflict, read the stages
  (`git show :1:`, `:2:`, `:3:`) and keep both sides' intent. During a rebase
  `--ours` is the base and `--theirs` is your commit — the reverse of a merge.
  Never take a side whole, never `git rebase --skip`, and ask the user when
  the code and its history do not decide.
- **Verify** by re-running the same checks. A check that passed before and
  fails now stops the run, as does an undecided conflict; nothing reaches the
  remote while either stands.
- **Publish** with
  `git push --force-with-lease=<branch>:<pre-fetch-sha> --force-if-includes`,
  the lease sha captured before the fetch. Never use a bare `--force`; a
  branch that was never pushed gets `git push -u` instead. The explicit
  invocation authorized the rewrite — do not stop to confirm it.

Report the base and its source, the commits replayed, the conflicts resolved,
the before/after checks, and whether the push happened. Does not wait for CI
and does not merge.
