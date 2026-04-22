---
name: team-research
description: Research a codebase area before making changes. Dispatches parallel BLIND read-only agents (file-finder + researcher) that read the neutral brief and questions, never the original task. Trigger on "research this", "explore the codebase for", or "/team-research".
---

# TEAM Research — Standalone Phase

Run the RESEARCH phase only, then stop. Research is **blind** — the
researcher and file-finder never see the user's original task description.
They consume only `brief.md` and `questions.md` from the prior Question
phase.

## Input

Feature description: `$ARGUMENTS` (only used if no Question phase has run yet)

If `$ARGUMENTS` is empty AND no Question artifacts exist, ask the user
what to research and stop.

## Execution

1. Stat `docs/plans/<today>-<topic>-task.md`. If missing, run
   `/team-question $ARGUMENTS` first to produce the Question artifacts.
2. Follow the phase loop defined in `/team`. It dispatches `file-finder`
   and `researcher` in parallel; the router writes the combined research
   artifact to `docs/plans/<today>-<topic>-research.md`.
3. **Stop once `docs/plans/<today>-<topic>-research.md` exists** — do
   not continue to DESIGN.

## Completion

Report:
- Path to the research artifact
- Key findings (3-5 bullets)
- Open questions count
- Suggest: "/team-design to align on approach"
