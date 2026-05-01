---
name: team-resume
description: Resume an interrupted TEAM pipeline by inspecting docs/plans/ artifacts and rebuilding the TodoWrite ledger. Trigger on "resume the pipeline", "continue where we left off", or "/team-resume".
---

# TEAM Resume — Pipeline Recovery

Resume an interrupted pipeline by scanning artifacts on disk and
rebuilding the TodoWrite ledger. The artifacts and their frontmatter
are the durable record.

## Execution

1. List `docs/plans/*-task.md` and pick the most recent topic by file
   mtime. (You can also accept a `topic` slug as `$ARGUMENTS` to jump
   directly to a specific topic.)
2. If no task.md is found: report "No active pipeline. Run /team to
   start." and stop.
3. From the matched filename, derive `today` and `topic`. List all
   `docs/plans/<today>-<topic>-*.md` artifacts.
4. For gated artifacts (design, structure), read the YAML frontmatter
   to determine `approved` (boolean) and `revision` (count).
5. Determine the current phase from the inference table below.
6. **Rebuild TodoWrite** — seed it with one item per phase, marking
   completed each phase whose artifact is on disk (and approved, if
   gated). Mark the current phase `in_progress`.
7. Report: phase, revisions on design/structure if any, the artifact
   list, the rebuilt TodoWrite ledger, and the next expected phase.
   Ask the user "Continue?"
8. On confirmation, re-enter the phase loop at the inferred phase via
   `/team`.

## Phase inference

| Latest artifact present                                         | Current phase       |
|-----------------------------------------------------------------|---------------------|
| `task.md` only                                                  | RESEARCH            |
| `research.md`                                                   | DESIGN              |
| `design.md` (frontmatter `approved: false`)                     | DESIGN (human gate) |
| `design.md` (frontmatter `approved: true`)                      | STRUCTURE           |
| `structure.md` (frontmatter `approved: false`)                  | STRUCTURE (gate)    |
| `structure.md` (frontmatter `approved: true`)                   | PLAN                |
| `plan.md`                                                       | WORKTREE            |
| worktree exists for the topic branch (`git worktree list`)      | IMPLEMENT           |
| topic branch has slice commits + verifier passed                | PR                  |
| PR opened or commit shipped                                     | SHIPPED             |
