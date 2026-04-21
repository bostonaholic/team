---
name: team-structure
description: Break the approved design into vertical slices with verification checkpoints. The structure document is the human's last review point before code is written. Trigger on "slice this up", "break the design into steps", or "/team-structure".
---

# TEAM Structure — Standalone Phase

Run the STRUCTURE phase. Requires `design.approved` in the event log.

## Execution

1. Read `~/.team/<topic>/events.jsonl`. Scan for `design.approved`.
2. If not found: report "No approved design. Run /team-design first." and stop.
3. Follow the event loop from `skills/team/registry.json`. This dispatches
   `structure-planner`, which writes `docs/plans/<today>-<topic>-structure.md`
   with vertical slices.
4. At the human gate (`structure.drafted`): present the structure **in full**
   and ask "Do you approve this structure?".
5. **Stop after `structure.approved` or `structure.revision-requested` is recorded.**

## On revision

If the user rejects, capture their feedback verbatim into the
`structure.revision-requested` event. The structure-planner re-drafts on the
next loop iteration.

## Completion

Report structure path and suggest: "/team-plan to produce the tactical plan"
