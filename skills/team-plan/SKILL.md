---
name: team-plan
description: Produce the tactical implementation plan from the approved structure. The plan is for the implementer — humans review the structure, not the plan. No human approval gate at this phase. Trigger on "plan the implementation", "spell out the steps", or "/team-plan".
---

# TEAM Plan — Standalone Phase

Run the PLAN phase. Requires `structure.approved` in the event log.

## Execution

1. Read `~/.team/<topic>/events.jsonl`. Scan for `structure.approved`.
2. If not found: report "No approved structure. Run /team-structure first." and stop.
3. Follow the event loop from `skills/team/registry.json`. This dispatches
   the `planner`, which writes `docs/plans/<today>-<topic>-plan.md`.
4. **Stop after `plan.drafted` is recorded.**

There is no human gate here. Humans reviewed the structure already; the plan
is a tactical artifact for the implementer.

## Completion

Report plan path and suggest: "/team-worktree to prepare an isolated worktree"
