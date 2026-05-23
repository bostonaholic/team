---
name: team-plan
description: Produce the tactical implementation plan from the approved structure. The plan is for the implementer — humans review the structure, not the plan. No human approval gate at this phase. Trigger on "plan the implementation", "spell out the steps", or "/team-plan".
argument-hint: "[docs/plans/<id>/]"
---

# Team Plan — Tactical Implementation Plan

Run the PLAN phase. There is no human gate here; humans reviewed the
structure already, and the plan is a tactical artifact for the implementer.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery block below resolves it.

The `planner` reads:

- `$ARGUMENTS/structure.md` (must carry `approved: true` in its frontmatter)
- `$ARGUMENTS/design.md`
- `$ARGUMENTS/research.md`

Resolve the artifact directory by running this self-contained block (one bash
call — agent threads reset cwd between calls). The predecessor filter requires
an **approved** `structure.md`, so unapproved candidates are skipped:

```sh
# Three-tier artifact-directory discovery (archetype A).
# ID_RE + PHASE_FILES canonical from hooks/session-start-recover.mjs.
# PHASE_FILES recency mirrors findActiveTopic() in session-start-recover.mjs.
# NOTE: this block is duplicated across 8 skills by design (see docs/architecture.md); future: shared discover-topic.sh.
ID_RE='^([A-Za-z][A-Za-z0-9_]*-[0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2})-[a-z0-9][a-z0-9-]*$'
PHASE_FILES="task questions research design structure plan"
PRED="structure.md"            # predecessor artifact this skill consumes
# Tier 1 — explicit: $ARGUMENTS names an existing dir → use verbatim.
if [ -n "$ARGUMENTS" ] && [ -d "$ARGUMENTS" ]; then
  echo "$ARGUMENTS"; exit 0
fi
# Tier 2 — discover: newest ID_RE dir under docs/plans/ that holds PRED.
best=""; best_mtime=-1
# Assumes cwd is the repo/worktree root (where docs/plans/ lives).
for dir in docs/plans/*/; do
  name="$(basename "$dir")"
  printf '%s' "$name" | grep -qE "$ID_RE" || continue   # ID_RE filter
  [ -f "$dir$PRED" ] || continue                        # predecessor filter
  grep -qE '^approved:[[:space:]]*true[[:space:]]*$' "$dir$PRED" || continue
  m=-1
  for p in $PHASE_FILES; do
    f="$dir$p.md"
    [ -f "$f" ] || continue                             # skip racing/absent
    s="$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null)" || continue
    [ "${s:-0}" -gt "$m" ] && m="$s"                    # max-mtime over PHASE_FILES
  done
  [ "$m" -gt "$best_mtime" ] && { best_mtime="$m"; best="$dir"; }
done
[ -n "$best" ] && { echo "$best"; exit 0; }
# Tier 3 — none found: print nothing → fall to AskUserQuestion (prose below).
```

- **If the block printed a path**, use it as `$ARGUMENTS` for the rest of this
  skill (tier 1 explicit arg, or tier 2 discovery of an approved predecessor).
  When the path came from tier 2 (no explicit arg), announce the resolved
  directory to the user before proceeding, so an auto-picked topic is never
  silent.
- **If the block printed nothing** (tier 3 — no directory holds an approved
  `structure.md`), do not hard-error. Fire `AskUserQuestion` with a `Setup`
  header and labeled options:
  - **Run the producer** — run `/team-structure docs/plans/<id>/` to produce or
    approve `structure.md`.
  - **Provide a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).

## Execution

1. Use the directory resolved in `## Input` (the approval grep there already
   confirmed `structure.md` carries `approved: true`).
2. Dispatch `planner`, which writes `$ARGUMENTS/plan.md` with file-level
   steps and per-slice acceptance test mappings.
3. **Stop once `$ARGUMENTS/plan.md` exists.**

## Completion

Report plan path and tell the user:
**"Next: run `/team-worktree docs/plans/<id>/`"**
