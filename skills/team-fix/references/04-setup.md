## Setup

1. **Resolve the input** to a bug description, per `## Input`. Then make sure
   that `opening-prs` and `writing-commit-messages` appear in the session's
   skill list; Claude Code lists them with the `bostonaholic:` prefix. When one
   is absent, print `Missing skill <name>. Install or update the
   bostonaholic/skills collection (README "Skills that moved"), then run
   /team-fix <input>.` with the missing name and this run's input, and stop
   before step 2 moves the ticket.
2. **Move the ticket to in-progress** as the first action, before other work,
   when the input resolved to a ticket id or issue. Follow the
   ticket-lifecycle rules in [tracking rules](../../team-pr/references/tracking.md);
   best-effort, never blocking.
3. **Derive `<id>`:** choose a 2–4 word `<kebab-topic>` and run
   `"<team-skill-dir>/scripts/plan-id.sh" [--ticket <ticketId>] <kebab-topic>`,
   where `<team-skill-dir>` is the absolute directory containing the
   installed `skills/team/SKILL.md`. Its `id=` line is `<id>`; its `topic=`
   line is step 5's `topic`. Exit 2: fix the topic or ticket its stderr names
   and rerun.
4. **Run the WORKTREE phase** (`## Worktree` below) before anything touches
   the working tree or authors the artifact directory.
5. **Create `docs/plans/<id>/`** inside the resolved worktree with a minimal
   `1-task.md`: standard frontmatter (`topic`, `date`, `phase: task`,
   `ticketId`) plus a brief bug description. `topic` is step 3's `topic=`
   line — never the ticket id, the date, or a reworded description.
   `ticketId` lives only on `1-task.md`.
6. **Seed the TodoWrite ledger**:
   `Worktree → Reproduce → Red (failing test) → Green (minimal fix) → Verify → Ship`,
   with `Worktree` `in_progress`.
