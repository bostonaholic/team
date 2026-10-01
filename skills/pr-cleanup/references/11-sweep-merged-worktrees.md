### Sweep — remove every merged worktree in the repository

A session cannot remove the worktree it runs in, and a host application can
park a finished session's worktree instead of deleting it. Every teardown
therefore sweeps the whole repository: what one session had to keep, the next
teardown in that repository removes, once its PR merged.

Run the script from the session's working directory, with no arguments.
Resolve `<pr-cleanup-skill-dir>` to this skill's absolute directory:

```sh
"<pr-cleanup-skill-dir>/scripts/sweep-worktrees.sh"
```

Do not `cd` to `$PRIMARY_ROOT` first. The script uses the directory it starts
in to recognize the current session's worktree. It resolves `$PRIMARY_ROOT`
and `$DEFAULT` itself, as steps 0 and 1 do, and anchors every command it runs.

**The merged gate.** A commit passes when one PR in the repository's last 300
has all of these:

- `headRepositoryOwner.login` equal to the owner half of `$REPO`.
- `headRefOid` equal to the commit, byte for byte.
- `state` equal to `MERGED`.
- a `mergeCommit.oid` that is an ancestor of `origin/$DEFAULT`.

The gate holds for a detached HEAD and for a squash merge. A HEAD with commits
past the PR head fails it, because those commits are new work.

The script fetches origin, reads the PRs in one `gh` call, and then:

1. Prunes worktree entries whose directory is gone.
2. Sorts each linked worktree by the first rule that matches:

   | Worktree | Result |
   |---|---|
   | Holds the invoking directory | `kept (current session — next teardown removes it)` |
   | Is the working directory of a live process | `kept (in use)` |
   | Its HEAD fails the gate, and a closed PR has that head | `kept (PR #N closed — abandon with /pr-cleanup N)` |
   | Its HEAD fails the gate | `kept (no merged PR)` |
   | Lies outside `$PRIMARY_ROOT/.claude/worktrees/` | `report-only (<the removal command>)` |
   | Is locked | `kept (locked — unlock with git worktree unlock)` |
   | `git worktree remove` refuses it | `kept (dirty)`, then its `git status --short` lines |
   | Otherwise | `removed` |

3. Deletes each local branch that no remaining worktree holds, whose name is not
   protected (step 2's list), and whose tip passes the gate: `branch-deleted`.
4. Runs `git remote prune origin`.

The script never passes `--force`. Ignored files do not block a removal.
Untracked and modified files do, and the sweep has no gate to discard them.
A `kept` or `report-only` worktree stays for its owner, or for a later sweep.
Do not remove one by hand to finish the sweep.

Exit 0 means the sweep ran, even when it kept everything. Exit 1 means a
setup failure, such as a failed fetch or `gh` call, before the script removes
or deletes anything. Report the stderr message verbatim, then continue the
rest of the teardown.

Report every output line as the sweep's result.
