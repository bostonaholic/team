## Setup

1. **Resolve the input** to a bug description first, per `## Input`.
2. **Move the ticket to in-progress.** If the input resolved to a ticket id
   or issue, move that ticket to its tracker's in-progress state as the first
   action of the fix, before any other work begins. Read
   [tracking rules](../team-pr/references/tracking.md) and follow its
   ticket-lifecycle rules, best-effort: skip silently when no tracker
   mechanism exists, and never block the pipeline on a tracker update.
3. **Derive `<id>`:** choose a 2–4 word `<kebab-topic>` and run
   `"<team-skill-dir>/scripts/plan-id.sh" [--ticket <ticketId>] <kebab-topic>`,
   where `<team-skill-dir>` is the absolute directory containing the
   installed `skills/team/SKILL.md`. Its `id=` line is `<id>` and its
   `topic=` line is the `topic` for step 5. Exit 2: fix the topic or ticket
   its stderr names and rerun.
4. **Run the WORKTREE phase** (`## Worktree` below) before anything else
   touches the working tree. It must finish before the artifact directory is
   authored.
5. **Create `docs/plans/<id>/`** inside the resolved worktree, and write a
   minimal `docs/plans/<id>/1-task.md` with the standard frontmatter
   (`topic`, `date`, `phase: task`, `ticketId`) plus a brief description
   of the bug. The `topic` value is step 3's `topic=` line. Never use the
   ticket id, the date, or a re-worded description as the topic.
   `ticketId` lives only on `1-task.md`.
6. **Seed the TodoWrite ledger** with the bug-fix phases:
   `Worktree → Reproduce → Red (failing test) → Green (minimal fix) → Verify → Ship`.
   Mark `Worktree` as `in_progress`.
