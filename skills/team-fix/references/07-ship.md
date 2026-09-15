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
3. **Screenshots for a UI-impacting fix.** Read the
   [ux reviewer brief](../code-review/references/ux-reviewer.md) and apply its
   `## Screenshot Capture (UI projects)` UI-impact gate to the full branch
   diff. A backend fix that changes the interface counts. When UI impact is
   uncertain, capture. Only a fix that does not change the interface attaches
   nothing. When it does, run the brief's capture procedure into
   `docs/plans/<id>/screenshots/`, then call
   the Skill tool with `pr-screenshots` and attach the PNGs. Build the entries
   file and read `result.json` per
   [Screenshot Upload](../team-pr/references/04-screenshot-upload.md), with the
   run's `docs/plans/<id>/` directory as the `$ARGUMENTS` that reference names.
   A capture that cannot run degrades to the note; it never blocks the PR.
4. **Ticket — link now, in-review when ready.** If `ticketId` is non-null in
   `1-task.md`'s frontmatter, read [tracking rules](../team-pr/references/tracking.md) and
   apply its ticket-lifecycle rules: link the PR to the ticket through the
   conditional closing footer, keep the ticket in-progress while the PR is a
   draft and move it to in-review only once the PR is marked ready for
   review, and never close the ticket by hand — the link auto-closes it on
   merge. Best-effort. Never block. Surface the `ticketId` in the completion
   report.
5. Mark all TodoWrite items complete.
