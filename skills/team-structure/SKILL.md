---
name: team-structure
description: Internal STRUCTURE module for Team. Given one explicit artifact directory with a reviewed design, write vertical slices to 7-structure.md. Never select a topic, ask for approval, or run Plan.
user-invocable: false
effort: medium
argument-hint: "<absolute docs/plans/<id>/ directory>"
---

# Team Structure

Run STRUCTURE only. `$ARGUMENTS` must be one existing absolute
`docs/plans/<id>/` directory. Do not search for a topic.
Follow `skills/principle-progress-tracking/SKILL.md` for this procedure.
Apply `skills/principle-fail-closed/SKILL.md`.

1. Require `6-design.md`, `5-research.md`, and `1-task.md`.
2. Read the highest numbered `design-review-<n>.md` frontmatter. Proceed only
   on APPROVE or COMMENT. Missing, malformed, or REQUEST CHANGES verdicts fail
   closed; do not run DESIGN.
3. If valid `7-structure.md` exists, return it unchanged.
4. Dispatch `structure-planner` with the explicit artifact paths. It writes
   vertical, independently verifiable slices and records repo slugs when
   `4-repos.md` exists.
5. Verify `7-structure.md` has matching `topic` and `phase: structure`.

There is no approval gate. Return the structure path and stop; the coordinator
decides whether PLAN runs.
