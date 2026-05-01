---
name: team-plan
description: Produce the tactical implementation plan from the approved structure. The plan is for the implementer — humans review the structure, not the plan. No human approval gate at this phase. Trigger on "plan the implementation", "spell out the steps", or "/team-plan".
argument-hint: "docs/plans/<id>/"
---

# TEAM Plan — Tactical Implementation Plan

Run the PLAN phase. There is no human gate here; humans reviewed the
structure already, and the plan is a tactical artifact for the implementer.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`.

The `planner` reads:

- `$ARGUMENTS/structure.md` (must carry `approved: true` in its frontmatter)
- `$ARGUMENTS/design.md`
- `$ARGUMENTS/research.md`

If `$ARGUMENTS/structure.md` is missing or not approved, tell the user to
run `/team-structure docs/plans/<id>/` first and stop.

## Execution

1. **Verify** `$ARGUMENTS/structure.md` exists and frontmatter shows
   `approved: true`.
2. Dispatch `planner`, which writes `$ARGUMENTS/plan.md` with file-level
   steps and per-slice acceptance test mappings.
3. **Stop once `$ARGUMENTS/plan.md` exists.**

## Completion

Report plan path and tell the user:
**"Next: run `/team-worktree docs/plans/<id>/`"**
