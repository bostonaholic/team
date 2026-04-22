---
name: team-structure
description: Break the approved design into vertical slices with verification checkpoints. The structure document is the human's last review point before code is written. Trigger on "slice this up", "break the design into steps", or "/team-structure".
---

# TEAM Structure — Standalone Phase

Run the STRUCTURE phase. Requires design approval on disk.

## Execution

1. Stat `docs/plans/<today>-<topic>-design.md.approved`. If missing,
   report "Design not yet approved — run /team-design first." and stop.
2. Follow the phase loop from `/team`. It dispatches `structure-planner`,
   which writes `docs/plans/<today>-<topic>-structure.md` with vertical
   slices.
3. At the human gate: present the structure **in full** and ask "Do you
   approve this structure?".
4. **Stop once `docs/plans/<today>-<topic>-structure.md.approved` sidecar
   is touched, or the structure has been re-dispatched for revision.**

## On revision

If the user rejects, pass the feedback verbatim to the structure-planner
on re-dispatch and increment `structureRevisionCount` in `state.json`.

## Completion

Report structure path and suggest: "/team-plan to produce the tactical plan"
