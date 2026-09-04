## Hard Rules

1. **Never `git branch -D` without a gate.** Mode A requires the merged-PR
   verification (identity plus containment, Mode A step 1) — or, when
   that gate finds no merged PR, the user's explicit delete-anyway
   confirmation. Mode B requires the user's explicit abandon request. No
   ungated path exists.
2. **Never touch uncommitted tracked work.** A dirty tree stops the run
   (see step 3).
3. **Never skip `git fetch`** — the default branch may have moved, and a
   just-merged PR is only visible after a fetch.
4. **Always `--ff-only` for the resync pull.** A non-fast-forward default
   branch is a surprise to surface, never a merge to auto-resolve.
5. **Never assume the default branch is `main`** — detect it per repo
   (step 1).
6. **Never force-push or rebase origin.** Deleting the finished branch is
   the one sanctioned remote write (Mode B step 4, and the offer in Mode A
   step 5).
7. **"Delete the worktree" means the git worktree, never the primary
   clone.** Step 0's validated `$PRIMARY_ROOT` is what backs this rule with
   detection instead of a path convention.
8. **Stacks unwind child before parent** — for PR closes and for branch
   deletes. The rule governs whatever branch set a run resolves; a single
   resolved branch satisfies it trivially.
9. **Every command is anchored.** After step 0, every git command runs as
   `git -C "$PRIMARY_ROOT"` (including the remote-branch check and the
   prune offer), every `gh` command passes `--repo "$REPO"` (derived in
   step 0 — never `gh`'s cwd-based auto-detection), and non-git
   destructive commands take `$PRIMARY_ROOT`-absolute paths. Step 0 is
   what derives those anchors, so it runs before this rule applies; its
   end enumerates every anchor it derived, along with every command that
   uses a different anchor — and that list is closed.
10. **Protected names match case-insensitively, and `-D` requires an
    exact-case local branch.** On a case-insensitive filesystem `Main` IS
    `main`: a candidate whose lowercased form matches the default branch,
    `master`, `develop`, or `release/*` is refused (step 2), and no
    `git branch -D` runs unless `for-each-ref` lists a local branch whose
    name matches byte for byte (Mode A step 4, Mode B step 3).
11. **No destructive command, and no gate protecting one, relies on a
    variable set in an earlier Bash invocation.** Shell state does not
    persist between invocations: every invocation that uses
    `$PRIMARY_ROOT`, `$REPO`, or `$DEFAULT` re-derives them (the step 0
    block for the first two, step 1 for `$DEFAULT`) in that same
    invocation, and every expansion a destructive command or a gate
    depends on uses the `${VAR:?}` form so an unset variable aborts
    instead of expanding to empty. `$DEFAULT` is in this set because an
    empty expansion does not fail loudly — it silently drops the default
    branch out of step 2's protected-name pattern, leaving `main`
    deletable while the hard-coded `master`/`develop`/`release/*` entries
    still appear to protect it. Placement is part of the rule: `${VAR:?}`
    aborts as a direct command argument, but inside `$( )` it kills only
    the subshell and the parent continues with an empty value. Guard a
    value consumed inside a command substitution with a standalone
    `: "${VAR:?message}"` statement ahead of it.
