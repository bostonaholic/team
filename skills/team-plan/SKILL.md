---
name: team-plan
description: Produce the tactical implementation plan from the approved structure. The plan is for the implementer — humans review the structure, not the plan. No human approval gate at this phase. Trigger on "plan the implementation", "spell out the steps", or "/team-plan".
---

# TEAM Plan — Standalone Phase

Run the PLAN phase. Requires structure approval on disk.

## Execution

1. Stat `docs/plans/<today>-<topic>-structure.md.approved`. If missing,
   report "Structure not yet approved — run /team-structure first." and stop.
2. Follow the phase loop from `/team`. It dispatches the `planner`, which
   writes `docs/plans/<today>-<topic>-plan.md`.
3. **Stop once `docs/plans/<today>-<topic>-plan.md` exists on disk.**

There is no human gate here. Humans reviewed the structure already; the plan
is a tactical artifact for the implementer.

## Completion

Report plan path and suggest: "/team-worktree to prepare an isolated worktree"
