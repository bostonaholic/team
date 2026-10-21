## Ship

1. Commit twice: `test:` with the failing test, then `fix:` with the minimal
   fix.
2. **Open a draft PR automatically — do not ask.** First re-assert the branch
   gate: run `'<team-fix-skill-dir>/scripts/branch-gate.sh'` from the
   worktree (`<team-fix-skill-dir>` is the absolute directory holding the
   installed `skills/team-fix/SKILL.md`). Any exit other than 0 → push
   nothing and report its output. On `ok <branch>`, push that branch and
   open the PR as a **draft** (`gh pr create --draft`).
3. **Screenshots for a UI-impacting fix.** Apply the `## Screenshot Capture
   (UI projects)` UI-impact gate from the
   [ux reviewer brief](../team/references/ux-reviewer.md) to the full branch
   diff. Any interface change counts, not only a substantial one; when
   uncertain, capture. Only a fix that leaves the interface unchanged attaches
   nothing. On capture, run the brief's capture procedure into
   `docs/plans/<id>/screenshots/`, then the
   [Screenshot Upload](../team-pr/references/04-screenshot-upload.md)
   procedure with the run's `docs/plans/<id>/` as its `$ARGUMENTS`. A capture
   that cannot run degrades to the note; it never blocks the PR.
4. **Ticket — link now, in-review when ready.** If `1-task.md`'s `ticketId`
   is non-null, apply the ticket-lifecycle rules in
   [tracking rules](../team-pr/references/tracking.md): link the PR through
   the conditional closing line at the top of the body, keep the ticket
   in-progress while the PR is a draft, move it to in-review only once the PR
   is marked ready, and never close it by hand. Best-effort; never block.
   Surface the `ticketId` in the completion report.
