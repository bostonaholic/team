## Setup

1. **Resolve `$ARGUMENTS`** to a description (fetch issue through `gh` if a
   URL. Lookup tracker if a ticket-only ID. Otherwise use as-is).
2. **Capture `ticketId`** — if `$ARGUMENTS` starts with a ticket-like
   pattern (e.g., `<system>-<id>`), set it aside as `ticketId` for
   `1-task.md`. Otherwise leave `ticketId` as `null`.
3. **Move the ticket to in-progress.** If a `ticketId` or issue was
   resolved in steps 1–2, move that ticket to its tracker's in-progress
   state. This is the first action of the run, before any other work
   begins. Call the Skill tool with `tracking-tickets` and follow its
   ticket-lifecycle rules, best-effort — skip silently when no tracker
   mechanism exists. Never block the pipeline on a tracker update.
4. **Derive `<id>`:**
   - With ticket: `<TICKET>-<kebab-topic>` (e.g., `ENG-1234-add-auth`)
   - Without ticket: `<YYYY-MM-DD>-<kebab-topic>` (e.g.,
     `2026-05-01-add-auth`)
5. **Seed the TodoWrite ledger** with one item per phase, in order:
   `Worktree → Question → Research → Design → Structure → Plan → Implement → PR`.
   Mark `Worktree` as `in_progress`.
   See `principle-progress-tracking` for the per-step tracking convention agents follow within each phase.
   The home worktree and `docs/plans/<id>/` are both created at the leading
   WORKTREE phase (see "Orchestrator-Emit Gate (leading worktree)" below) —
   not here.
6. **Resolve the canonical artifact directory.** Artifacts now live inside
   the worktree, authored there at the leading WORKTREE phase. Run
   `git worktree list` and look for a worktree path whose basename is
   `<id>`, per the `.claude/worktrees/<id>` convention. If one exists, the
   canonical artifact directory is `<worktree-path>/docs/plans/<id>/` — use
   it for resume detection and for the rest of the session (thread its
   absolute path into every downstream dispatch). If no worktree for `<id>`
   exists, fall back to the in-place home `docs/plans/<id>/` (the fallback
   path from the leading WORKTREE phase). This is the orchestrator-side
   mirror of the recovery hooks' worktree discovery.
7. **Resume detection.** If artifacts already exist for `<id>` under the
   canonical artifact directory resolved in step 6, fast-forward the
   ledger. Mark completed any phase whose artifacts are present. DESIGN is
   complete only when the latest `design-review-<n>.md` carries a passing
   verdict (APPROVE or COMMENT). A `6-design.md` with no passing review
   resumes **at the review step**, never a re-draft (any `approved` fields
   left by older runs are ignored). Then mark the first incomplete phase
   `in_progress`.
   **Never re-dispatch a phase whose artifact already exists** — re-running
   QUESTION over an existing `1-task.md`, for example, would overwrite
   in-progress work (data loss).
   Resume is an idempotent re-run: already-done is done, never an error (`principle-idempotent-reruns`).

You hold the description in your own context. Downstream of QUESTION the
description must NEVER appear in any artifact or agent payload outside
`1-task.md` and the questioner's own outputs.
