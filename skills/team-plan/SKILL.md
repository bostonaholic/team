---
name: team-plan
description: 'Produces the tactical implementation plan. Trigger on "plan the implementation", "spell out the steps", or "/team-plan".'
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team Plan — Tactical Implementation Plan

Run the PLAN phase. There is no gate here. The plan is a tactical artifact
for the implementer, mechanically derived from the structure.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery command below resolves it.

The `planner` reads:

- `$ARGUMENTS/7-structure.md`
- `$ARGUMENTS/6-design.md`
- `$ARGUMENTS/5-research.md`

Resolve `<team-skill-dir>` to the absolute directory containing
`skills/team/SKILL.md`. From the repository root, run the command below. Its
predecessor filter requires a `7-structure.md` (structure is not gated, so no
approval check):

```sh
"<team-skill-dir>/discover-topic.sh" "${ARGUMENTS:-}" "7-structure.md"
```

- **If the command printed a path**, use it as `$ARGUMENTS` for the rest of this
  skill (tier 1 explicit arg, or tier 2 discovery of the predecessor).
  When the path came from tier 2 (no explicit arg), announce the resolved
  directory to the user before proceeding, so an auto-picked topic is never
  silent.
- **If the command printed nothing** (tier 3 — no directory holds a
  `7-structure.md`), do not hard-error. Fire `AskUserQuestion` with a `Setup`
  header and labeled options:
  - **Run the producer** — run `/team-structure docs/plans/<id>/` to produce
    `7-structure.md`.
  - **Give a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).

## Execution

1. Use the directory resolved in `## Input` (the discovery there already
   confirmed `7-structure.md` exists).
2. Dispatch `planner`, which writes `$ARGUMENTS/8-plan.md` with file-level
   steps and per-slice acceptance test mappings.
3. **Stop once `$ARGUMENTS/8-plan.md` exists.**

Report plan path and tell the user:
**"Next: run `/team-worktree docs/plans/<id>/`"**
