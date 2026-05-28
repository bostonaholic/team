---
name: team-structure
description: Break the approved design into vertical slices with verification checkpoints. The structure document is the human's last review point before code is written. Trigger on "slice this up", "break the design into steps", or "/team-structure".
argument-hint: "[docs/plans/<id>/]"
---

# Team Structure — How Do We Get There?

Run the STRUCTURE phase. This is the second (and final) human gate.

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
# Three-tier artifact-directory discovery (archetype A).
# ID_RE + PHASE_FILES canonical from hooks/session-start-recover.mjs.
# PHASE_FILES recency mirrors findActiveTopic() in session-start-recover.mjs.
# NOTE: this block is duplicated across 8 skills by design (see ARCHITECTURE.md); future: shared discover-topic.sh.
ID_RE='^([A-Za-z][A-Za-z0-9_]*-[0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2})-[a-z0-9][a-z0-9-]*$'
PHASE_FILES="task questions research design structure plan"
PRED="design.md"            # predecessor artifact this skill consumes
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
  `design.md`), do not hard-error. Fire `AskUserQuestion` with a `Setup` header
  and labeled options:
  - **Run the producer** — run `/team-design docs/plans/<id>/` to produce or
    approve `design.md`.
  - **Provide a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).

## Execution

1. Use the directory resolved in `## Input` (the approval grep there already
   confirmed `design.md` carries `approved: true`).
2. Dispatch `structure-planner`, which writes `$ARGUMENTS/structure.md`
   with vertical slices and frontmatter `approved: false`,
   `approved_at: null`, `revision: 0`.
3. **Human gate.** Present the structure **in full**, then use
   `AskUserQuestion` to capture the verdict. Use a single question with a
   `Decision` header and these options:
   - **Approve** — structure is ready; advance to PLAN.
   - **Request changes** — describe what to revise; re-dispatch
     `structure-planner` with the user's feedback verbatim.
   - **Reject** — abandon this structure and revisit DESIGN.

   - On Approve → edit `$ARGUMENTS/structure.md` frontmatter to set
     `approved: true` and `approved_at: <ISO-8601>`.
   - On Request changes → re-dispatch `structure-planner` with feedback
     verbatim. New draft increments `revision: <n+1>`. Cap at
     `revision: 5`.
4. **Stop once `$ARGUMENTS/structure.md` carries `approved: true`.**

## Completion

Report structure path and tell the user:
**"Next: run `/team-plan docs/plans/<id>/`"**
