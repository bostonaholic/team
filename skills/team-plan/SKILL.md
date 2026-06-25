---
name: team-plan
description: Produce the tactical implementation plan from the structure. The plan is an autonomous artifact for the implementer — no human approval gate at this phase (design is the pipeline's only human gate). Trigger on "plan the implementation", "spell out the steps", or "/team-plan".
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team Plan — Tactical Implementation Plan

Run the PLAN phase. There is no human gate here; the plan is a tactical
artifact for the implementer, mechanically derived from the structure.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery block below resolves it.

The `planner` reads:

- `$ARGUMENTS/structure.md`
- `$ARGUMENTS/design.md`
- `$ARGUMENTS/research.md`

Resolve the artifact directory by running this self-contained block (one bash
call — agent threads reset cwd between calls). The predecessor filter requires
a `structure.md` (structure is not human-gated, so no approval check):

```sh
# Three-tier artifact-directory discovery (archetype A) — shared script.
# Single source: skills/qrspi-workflow/discover-topic.sh (was duplicated 8x).
# Args: <pred> <require_approved> <explicit_dir>; scans docs/plans/ in cwd.
bash "${CLAUDE_PLUGIN_ROOT}/skills/qrspi-workflow/discover-topic.sh" "structure.md" "" "$ARGUMENTS"
```

- **If the block printed a path**, use it as `$ARGUMENTS` for the rest of this
  skill (tier 1 explicit arg, or tier 2 discovery of the predecessor).
  When the path came from tier 2 (no explicit arg), announce the resolved
  directory to the user before proceeding, so an auto-picked topic is never
  silent.
- **If the block printed nothing** (tier 3 — no directory holds a
  `structure.md`), do not hard-error. Fire `AskUserQuestion` with a `Setup`
  header and labeled options:
  - **Run the producer** — run `/team-structure docs/plans/<id>/` to produce
    `structure.md`.
  - **Provide a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).

## Execution

> Follow `skills/progress-tracking/SKILL.md`: when this procedure has two or more steps, seed one todo item per step before starting and mark each complete as you go.

1. Use the directory resolved in `## Input` (the discovery there already
   confirmed `structure.md` exists).
2. Dispatch `planner`, which writes `$ARGUMENTS/plan.md` with file-level
   steps and per-slice acceptance test mappings.
3. **Stop once `$ARGUMENTS/plan.md` exists.**

## Completion

Report plan path and tell the user:
**"Next: run `/team-worktree docs/plans/<id>/`"**
