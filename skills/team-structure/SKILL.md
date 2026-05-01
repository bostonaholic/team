---
name: team-structure
description: Break the approved design into vertical slices with verification checkpoints. The structure document is the human's last review point before code is written. Trigger on "slice this up", "break the design into steps", or "/team-structure".
argument-hint: "docs/plans/<id>/"
---

# TEAM Structure — How Do We Get There?

Run the STRUCTURE phase. This is the second (and final) human gate.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`.

The `structure-planner` reads:

- `$ARGUMENTS/design.md` (must carry `approved: true` in its frontmatter)
- `$ARGUMENTS/research.md`
- `$ARGUMENTS/task.md` (for cross-reference; not for re-litigating intent)

If `$ARGUMENTS/design.md` is missing or not approved, tell the user to
run `/team-design docs/plans/<id>/` first and stop.

## Execution

1. **Verify** `$ARGUMENTS/design.md` exists and frontmatter shows
   `approved: true`.
2. Dispatch `structure-planner`, which writes `$ARGUMENTS/structure.md`
   with vertical slices and frontmatter `approved: false`,
   `approved_at: null`, `revision: 0`.
3. **Human gate.** Present the structure **in full** and ask: "Do you
   approve this structure?"
   - On approve → edit `$ARGUMENTS/structure.md` frontmatter to set
     `approved: true` and `approved_at: <ISO-8601>`.
   - On reject → re-dispatch `structure-planner` with feedback verbatim.
     New draft increments `revision: <n+1>`. Cap at `revision: 5`.
4. **Stop once `$ARGUMENTS/structure.md` carries `approved: true`.**

## Completion

Report structure path and tell the user:
**"Next: run `/team-plan docs/plans/<id>/`"**
