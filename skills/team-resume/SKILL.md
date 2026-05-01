---
name: team-resume
description: Resume an interrupted TEAM pipeline by inspecting docs/plans/ artifacts and ~/.team/<topic>/state.json. Trigger on "resume the pipeline", "continue where we left off", or "/team-resume".
---

# TEAM Resume — Pipeline Recovery

Resume an interrupted pipeline by reading the snapshot and listing the
artifacts on disk. No event-log replay.

## Execution

1. Scan `~/.team/*/state.json`. Load the most recent by `lastUpdated` using
   `readState(topic)` from `lib/state.mjs`.
2. If no snapshot is found: report "No active pipeline. Run /team to start."
   and stop.
3. From the snapshot's `topic` and `today`, list files matching
   `docs/plans/<today>-<topic>-*.md`. For gated artifacts (design,
   structure), inspect each one's frontmatter to determine if
   `approved: true`.
4. Report `phase`, `designRevisionCount`, `structureRevisionCount`,
   `verificationRetryCount`, the artifacts found on disk, and the next
   expected phase (see table below). Ask the user "Continue?"
5. On confirmation, re-enter the phase loop at `snapshot.phase`.

## Phase inference

| Latest artifact present                                         | Expected next phase |
|-----------------------------------------------------------------|---------------------|
| `task.md` only                                                  | RESEARCH            |
| `research.md`                                                   | DESIGN              |
| `design.md` (frontmatter `approved: false`)                     | DESIGN (human gate) |
| `design.md` (frontmatter `approved: true`)                      | STRUCTURE           |
| `structure.md` (frontmatter `approved: false`)                  | STRUCTURE (gate)    |
| `structure.md` (frontmatter `approved: true`)                   | PLAN                |
| `plan.md`                                                       | WORKTREE            |
| worktree prepared (snapshot `phase=IMPLEMENT`)                  | IMPLEMENT           |
| verification passed (snapshot `phase=PR`)                       | PR                  |
