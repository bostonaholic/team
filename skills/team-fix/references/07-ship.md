## Ship

1. Commit in two commits:
   - `test:` commit with the failing test
   - `fix:` commit with the minimal fix
2. **Open a draft PR automatically — do not stop to ask.** The WORKTREE
   phase already put the run on a non-default branch. Re-assert the branch gate
   first — `git rev-parse --abbrev-ref HEAD` must not name the default branch.
   If it does, push nothing and report: the commits are local and recoverable;
   a push to the default branch is not. Otherwise push that branch and open the
   PR as a **draft** (`gh pr create --draft`).
3. **Ticket — link now, in-review when ready.** If `ticketId` is non-null in
   `1-task.md`'s frontmatter, call the Skill tool with `tracking-tickets` and
   apply its ticket-lifecycle rules: link the PR to the ticket through the
   conditional closing footer, keep the ticket in-progress while the PR is a
   draft and move it to in-review only once the PR is marked ready for
   review, and never close the ticket by hand — the link auto-closes it on
   merge. Best-effort. Never block. Surface the `ticketId` in the completion
   report.
4. Mark all TodoWrite items complete.
