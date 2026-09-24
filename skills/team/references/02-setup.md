## Setup

0. **Select the route first.** Read [routing](routing.md) and select the route
   from the leading argument, before any worktree or artifact is authored.
   A limited-scope route (`investigate`, `plan`, `prototype`)
   creates no production worktree: it writes its artifacts in place under the
   home `docs/plans/<id>/` and stops at its deliverable. Only a full route
   (`feature`, `fix`, `refactor`, or unprefixed) runs the leading WORKTREE
   phase below.
1. **Resolve `$ARGUMENTS`** to a description (fetch the issue's title and body
   through `gh issue view` if a URL. Lookup tracker if a ticket-only ID.
   Otherwise use as-is). If `$ARGUMENTS` is empty, ask the user to describe the
   feature and stop.
2. **Capture `ticketId`** — if `$ARGUMENTS` starts with a ticket-like
   pattern (e.g., `<system>-<id>`), set it aside as `ticketId` for
   `1-task.md`. Otherwise leave `ticketId` as `null`.
3. **Move the ticket to in-progress.** If a `ticketId` or issue was
   resolved in steps 1–2, move that ticket to its tracker's in-progress
   state. This is the first action of the run, before any other work
   begins. Read [tracking rules](../team-pr/references/tracking.md) and follow its
   ticket-lifecycle rules, best-effort — skip silently when no tracker
   mechanism exists. Never block the pipeline on a tracker update.
4. **Derive `<id>`:** `<TICKET>-<kebab-topic>` with a ticket, otherwise
   `<YYYY-MM-DD>-<kebab-topic>`.
5. **Seed the TodoWrite ledger** with one item per phase, in order:
   `Worktree → Question → Research → Design → Structure → Plan → Implement → PR`.
   Mark `Worktree` as `in_progress`.
   With no TodoWrite on the host, seed the substitute file ledger the
   Rules reference defines instead; it is written once WORKTREE creates
   the directory.
   The home worktree and `docs/plans/<id>/` are created at the leading
   WORKTREE phase ("Orchestrator-Emit Gate (leading worktree)" below), not here.
6. **Resolve the canonical artifact directory.** Run
   `git worktree list` and look for a worktree path whose basename is
   `<id>`, per the `.claude/worktrees/<id>` convention. If one exists, the
   canonical artifact directory is `<worktree-path>/docs/plans/<id>/` — use
   it for resume detection and for the rest of the session (thread its
   absolute path into every downstream dispatch). If no worktree for `<id>`
   exists, fall back to the in-place home `docs/plans/<id>/` (the fallback
   path from the leading WORKTREE phase).
7. **Resume detection.** If artifacts already exist for `<id>` under the
   canonical artifact directory resolved in step 6, fast-forward the
   ledger. Mark completed any phase whose artifacts are present. DESIGN is
   complete only when the latest `design-review-<n>.md` carries a passing
   verdict (APPROVE or COMMENT). A `6-design.md` with no passing review
   resumes **at the review step**, never a re-draft (any `approved` fields
   left by older runs are ignored). Then mark the first incomplete phase
   `in_progress`.
   **Never re-dispatch a phase whose artifact already exists.**

**Research-isolation invariant.** You hold the description in your own context. Downstream of QUESTION the
description must NEVER appear in any artifact or agent payload outside
`1-task.md` and the questioner's own outputs.
