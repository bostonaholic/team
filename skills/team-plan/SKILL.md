---
name: team-plan
description: Produce the tactical implementation plan from the approved structure. The plan is for the implementer — humans review the structure, not the plan. No human approval gate at this phase. Trigger on "plan the implementation", "spell out the steps", or "/team-plan".
---

# TEAM Plan — Standalone Phase

Run the PLAN phase. Two modes:

- **Resume mode** — `structure.md` carries `approved: true` in its
  frontmatter; planner consumes it.
- **Standalone mode** — no approved structure, but the user wants a
  tactical plan now. Bootstrap upstream artifacts inline.

## Input

`$ARGUMENTS` may be:

- Empty — resume mode. Requires `structure.md` on disk with
  `approved: true` in its frontmatter.
- A ticket ID — recorded as `ticketId` in `task.md` for the user's reference. The orchestrator does not call any ticketing system.
- Free-form text — treated as the feature/task description.

## Execution

1. Read `docs/plans/<today>-<topic>-structure.md` and check the
   frontmatter for `approved: true`.
2. **If missing and `$ARGUMENTS` is non-empty** — bootstrap by chaining
   inline: Question → Research → Design (with human gate) → Structure
   (with human gate). After both approvals, continue to plan.
3. **If missing and `$ARGUMENTS` is empty** — ask the user for a
   description; if still empty, stop.
4. Follow the phase loop from `/team`. It dispatches the `planner`, which
   writes `docs/plans/<today>-<topic>-plan.md`.
5. **Stop once `docs/plans/<today>-<topic>-plan.md` exists on disk.**

There is no human gate here. Humans reviewed the structure already; the plan
is a tactical artifact for the implementer.

## Completion

Report plan path and suggest: "/team-worktree to prepare an isolated worktree"
