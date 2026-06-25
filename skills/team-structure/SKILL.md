---
name: team-structure
description: Break the approved design into vertical slices with verification checkpoints. Runs autonomously and advances to PLAN — no human gate (design is the pipeline's only human gate). Trigger on "slice this up", "break the design into steps", or "/team-structure".
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team Structure — How Do We Get There?

Run the STRUCTURE phase. It runs autonomously and advances to PLAN — there
is **no human gate** here. Design is the pipeline's only human gate.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery block below resolves it.

The `structure-planner` reads:

- `$ARGUMENTS/design.md` (must carry `approved: true` in its frontmatter)
- `$ARGUMENTS/research.md`
- `$ARGUMENTS/task.md` (for cross-reference; not for re-litigating intent)

Resolve the artifact directory by running this self-contained block (one bash
call — agent threads reset cwd between calls). The predecessor filter requires
an **approved** `design.md`, so unapproved candidates are skipped:

```sh
# Three-tier artifact-directory discovery (archetype A) — shared script.
# Single source: skills/qrspi-workflow/discover-topic.sh (was duplicated 8x).
# Args: <pred> <require_approved> <explicit_dir>; scans docs/plans/ in cwd.
bash "${CLAUDE_PLUGIN_ROOT}/skills/qrspi-workflow/discover-topic.sh" "design.md" "1" "$ARGUMENTS"
```

- **If the block printed a path**, use it as `$ARGUMENTS` for the rest of this
  skill (tier 1 explicit arg, or tier 2 discovery of an approved predecessor).
  When the path came from tier 2 (no explicit arg), announce the resolved
  directory to the user before proceeding, so an auto-picked topic is never
  silent.
- **If the block printed nothing** (tier 3 — no directory holds an approved
  `design.md`), do not hard-error. Fire `AskUserQuestion` with a `Setup` header
  and labeled options:
  - **Run the producer** — run `/team-design docs/plans/<id>/` to produce or
    approve `design.md`.
  - **Provide a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).

## Execution

> Follow `skills/progress-tracking/SKILL.md`: when this procedure has two or more steps, seed one todo item per step before starting and mark each complete as you go.

1. Use the directory resolved in `## Input` (the approval grep there already
   confirmed `design.md` carries `approved: true`).
2. Dispatch `structure-planner`, which writes `$ARGUMENTS/structure.md`
   with vertical slices. The artifact carries plain frontmatter
   (`topic`, `date`, `phase: structure`) — no approval fields, because
   structure is not human-gated.
3. **No human gate.** Do not present the structure for approval — design is
   the only human gate. Within a full `/team` run the orchestrator advances
   to PLAN automatically; run standalone, this skill stops after writing the
   structure and reports the next command.
4. **Stop once `$ARGUMENTS/structure.md` exists.**

## Completion

Report the structure path. When run standalone, tell the user:
**"Next: run `/team-plan docs/plans/<id>/`"**
(Within a full `/team` run the orchestrator advances to PLAN automatically.)
