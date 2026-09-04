## Setup

1. **Resolve the input** to a bug description first. On empty `$ARGUMENTS`,
   ground in repo context, then ask only for genuine gaps, per the
   **"discover, do not demand"** rule in `## Input`. A ticket id or issue
   URL is resolved as `## Input` describes (`gh issue view` for URLs).
2. **Move the ticket to in-progress.** If the input resolved to a ticket id
   or issue, move that ticket to its tracker's in-progress state — this is
   the first action of the fix, before any other work begins. Call the Skill
   tool with `tracking-tickets` and
   follow its ticket-lifecycle rules, best-effort —
   skip silently when no tracker mechanism exists. Never block the pipeline
   on a tracker update.
3. **Derive `<id>`** the same way `/team` does (ticket-prefixed or
   date-prefixed kebab slug).
4. **Run the WORKTREE phase** (`## Worktree` below) before anything else
   touches the working tree. It settles which branch the fix commits to, so
   it must finish before the artifact directory is authored.
5. **Create `docs/plans/<id>/`** inside the resolved worktree, and write a
   minimal `docs/plans/<id>/1-task.md` with the standard frontmatter
   (`topic`, `date`, `phase: task`, `ticketId`) plus a brief description
   of the bug. The `topic` value is the kebab portion of `<id>` — i.e.
   `<id>` minus the `<TICKET>-` or `<YYYY-MM-DD>-` prefix. Never use the
   ticket id, the date, or a re-worded description as the topic.
   `ticketId` lives only on `1-task.md`. This is the single durable record
   for the fix and lets any `/team-*` command pick it up if interrupted.
6. **Seed the TodoWrite ledger** with the bug-fix phases:
   `Worktree → Reproduce → Red (failing test) → Green (minimal fix) → Verify → Ship`.
   Mark `Worktree` as `in_progress`.
   See `principle-progress-tracking` for the per-step tracking convention agents follow within each phase.
