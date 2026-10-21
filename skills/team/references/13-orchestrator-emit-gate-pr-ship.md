### Orchestrator-Emit Gate (PR / ship)

When the newest `review-<n>.md` and the newest `security-review-<n>.md` both
carry PASS and are current:

1. **Edit nothing before `team-pr` binds the review and security statuses**
   (from the newest `review-<n>.md` and `security-review-<n>.md`), including
   `CHANGELOG.md`, which `team-pr` updates after binding. A record is current
   only over a tree clean outside `docs/plans/`, so an edit here binds `stale`.
2. **Never version here.** Touch no version string, cut no dated changelog
   section, and put no version in the PR title. A reported owed bump is a
   *merge* precondition, not a cue to bump.
3. **Open a draft PR automatically; do not ask.** Push the branch and open the
   PR as a **draft** (`gh pr create --draft`) by calling the Skill tool with
   `team-pr`. In multi-repo mode, open **one draft PR per repo with commits
   ahead**, bodies cross-linked.
4. **Ticket — link now, in-review when ready.** If `1-task.md` has `ticketId`
   set, apply the ticket-lifecycle rules in
   [tracking rules](../team-pr/references/tracking.md): link through the
   conditional closing line at the top of the body (in multi-repo mode only
   the home repo's PR carries the closing keyword; companions get a
   non-closing qualified reference). Keep the ticket in-progress while the PR
   is a draft and move it to in-review only once the PR is marked ready. Never
   close it by hand. Best-effort; never block the pipeline.
5. Report the draft PR URL, the `ticketId`, and the absolute worktree-rooted
   `docs/plans/<id>/` path. Mark all TodoWrite items complete.
6. **Leave the worktree(s) in place.** Clean up a worktree only after its PR
   merges or on explicit user request, following "Ship (teardown)" in the
   [worktree playbook](../team-worktree/playbooks/worktree.md) for every
   involved repo.
