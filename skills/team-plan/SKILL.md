---
name: team-plan
description: Internal PLAN module for Team. Given one explicit artifact directory containing 7-structure.md, write the tactical implementation plan. Never select a topic, ask for approval, or run Implement.
user-invocable: false
effort: medium
argument-hint: "<absolute docs/plans/<id>/ directory>"
---

# Team Plan

Run PLAN only. `$ARGUMENTS` must be one existing absolute
`docs/plans/<id>/` directory. Require `7-structure.md`, `6-design.md`, and
`5-research.md`; do not search or run producers.
Follow `skills/principle-progress-tracking/SKILL.md` for this procedure.

1. If valid `8-plan.md` exists, return it unchanged.
2. Dispatch `planner` with the explicit predecessor paths.
3. Require file-level steps, per-slice acceptance checks, and `[repo: <slug>]`
   prefixes when `4-repos.md` exists.
4. Verify `8-plan.md` has the predecessor's `topic` and `phase: plan`.

The reviewed design is the scope contract; PLAN has no approval gate. Return
the plan path and stop. The coordinator decides whether IMPLEMENT runs.
