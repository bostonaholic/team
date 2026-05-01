---
name: team-research
description: Research a codebase area before making changes. Dispatches parallel BLIND read-only agents (file-finder + researcher) that read the neutral brief and questions, never the original task. Trigger on "research this", "explore the codebase for", or "/team-research".
---

# TEAM Research — Standalone Phase

Run the RESEARCH phase only, then stop. Research is **blind** — the
researcher and file-finder never see the user's original task description.
They consume only `brief.md` and `questions.md`.

## Input

`$ARGUMENTS` may be:

- Empty — resume mode. Requires existing Question artifacts on disk.
- A ticket ID — recorded as `ticketId` in `task.md` for the user's reference. The orchestrator does not call any ticketing system.
- Free-form text — treated as the feature/task description.

## Execution

1. Stat `docs/plans/<today>-<topic>-task.md`.
2. **If missing and `$ARGUMENTS` is non-empty** — dispatch the `questioner`
   inline to produce `task.md`, `questions.md`, `brief.md` from
   `$ARGUMENTS` before continuing. Do not ask the user to re-run
   `/team-question` first; just bootstrap the artifacts.
3. **If missing and `$ARGUMENTS` is empty** — ask the user what to
   research and stop.
4. Follow the phase loop defined in `/team`. It dispatches `file-finder`
   and `researcher` in parallel; the router writes the combined research
   artifact to `docs/plans/<today>-<topic>-research.md`.
5. **Stop once `docs/plans/<today>-<topic>-research.md` exists** — do
   not continue to DESIGN.

## Completion

Report:
- Path to the research artifact
- Key findings (3-5 bullets)
- Open questions count
- Suggest: "/team-design to align on approach"
