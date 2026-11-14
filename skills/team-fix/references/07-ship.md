## Ship

1. **Commit twice** through `writing-commit-messages`: `test:` with the
   failing test, then `fix:` with the minimal fix. Fix each type for the skill,
   and pass the `test:` commit's Red-run body line from the
   [bug-fix playbook](../playbooks/bug-fix.md) `## Commits`.
2. **Screenshots for a UI-impacting fix.** Apply the `## Screenshot Capture
   (UI projects)` UI-impact gate from the
   [ux reviewer brief](../../team/references/ux-reviewer.md) to the full branch
   diff. Any interface change counts, not only a substantial one; when
   uncertain, capture. Only a fix that leaves the interface unchanged captures
   nothing. On capture, run the brief's capture procedure into
   `docs/plans/<id>/screenshots/`, then
   `node "<team-pr-skill-dir>/scripts/manifest-entries.mjs" "docs/plans/<id>/" "docs/plans/<id>/entries.json"`
   (`<team-pr-skill-dir>` is the absolute directory holding the installed
   `skills/team-pr/SKILL.md`). Exit 1 or 2 makes its `reason` or stderr line
   the capture gap. A capture never blocks the PR.
3. **Re-assert the branch gate.** Run
   `'<team-fix-skill-dir>/scripts/branch-gate.sh'` from the worktree
   (`<team-fix-skill-dir>` is the absolute directory holding the installed
   `skills/team-fix/SKILL.md`). Any exit other than 0 → push nothing and
   report its output.
4. **Write `docs/plans/<id>/pr-inputs-home.md`** with the file-writing tool.
   Ship is this file's only writer. It holds `## Closing line` with the string
   from [tracking rules](../../team-pr/references/tracking.md) when
   `1-task.md`'s `ticketId` is non-null, the Verify return as context, and
   `## Capture gap` when step 2 returned one.
5. **Open a draft PR automatically — do not ask.** On `ok <branch>`, call
   `opening-prs --inputs <absolute path of pr-inputs-home.md>`.
6. **Ticket — link now, in-review when ready.** If `ticketId` is non-null,
   apply the ticket-lifecycle rules in
   [tracking rules](../../team-pr/references/tracking.md): keep the ticket
   in-progress while the PR is a draft, move it to in-review only once the PR
   is marked ready, and never close it by hand. Best-effort; never block.
   Surface the `ticketId` in the completion report.
