---
name: team-structure
description: Break the reviewed design into vertical slices with verification checkpoints. Runs autonomously and advances to PLAN — no approval gate. Trigger on "slice this up", "break the design into steps", or "/team-structure".
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team Structure — How Do We Get There?

Run the STRUCTURE phase. It runs autonomously and advances to PLAN — there
is **no gate** here. Nothing is presented for approval mid-run.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery block below resolves it.

The `structure-planner` reads:

- `$ARGUMENTS/design.md` (the reviewed design — the latest
  `$ARGUMENTS/design-review-<n>.md` must carry a passing verdict)
- `$ARGUMENTS/research.md`
- `$ARGUMENTS/task.md` (for cross-reference; not for re-litigating intent)

Resolve the artifact directory by running this self-contained block (one bash
call — agent threads reset cwd between calls). The predecessor filter requires
a `design.md` whose latest `design-review-<n>.md` carries a passing verdict
(APPROVE or COMMENT), so unreviewed or REQUEST-CHANGES candidates are skipped:

```sh
# Three-tier artifact-directory discovery (archetype A).
# ID_RE + PHASE_FILES canonical from hooks/session-start-recover.mjs.
# PHASE_FILES recency mirrors findActiveTopic() in session-start-recover.mjs.
# NOTE: this block is duplicated across 8 skills by design (see docs/architecture.md); future: shared discover-topic.sh.
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
  # Review-gate filter: the highest-<n> design-review-<n>.md must carry a
  # passing verdict (APPROVE or COMMENT) — mirrors the recovery hooks'
  # fail-closed designReviewPassed check.
  rv=""; rv_n=-1
  for r in "$dir"design-review-*.md; do
    [ -f "$r" ] || continue
    n="$(basename "$r" .md)"; n="${n#design-review-}"
    case "$n" in ''|*[!0-9]*) continue;; esac
    [ "$n" -gt "$rv_n" ] && { rv_n="$n"; rv="$r"; }
  done
  [ -n "$rv" ] || continue                              # no review → skip
  # Frontmatter-only verdict parse (mirrors the hooks): line 1 must be ---,
  # the scan stops at the closing --- (60-line window), so a body line
  # quoting "verdict: APPROVE" can never pass. Fail-closed.
  awk 'NR==1 { if ($0 != "---") exit; next } /^---$/ { exit } NR > 60 { exit } { print }' "$rv" \
    | grep -qE '^verdict:[[:space:]]*(APPROVE|COMMENT)[[:space:]]*$' || continue
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
  skill (tier 1 explicit arg, or tier 2 discovery of a reviewed predecessor).
  When the path came from tier 2 (no explicit arg), announce the resolved
  directory to the user before proceeding, so an auto-picked topic is never
  silent.
- **If the block printed nothing** (tier 3 — no directory holds a
  `design.md` with a passing design review), do not hard-error. Fire
  `AskUserQuestion` with a `Setup` header
  and labeled options:
  - **Run the producer** — run `/team-design docs/plans/<id>/` to produce
    and review `design.md`.
  - **Provide a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).

## Execution

> Follow `skills/progress-tracking/SKILL.md`: when this procedure has two or more steps, seed one todo item per step before starting and mark each complete as you go.

1. Use the directory resolved in `## Input`, then **verify the review
   gate**: the highest-`<n>` `$ARGUMENTS/design-review-<n>.md` must
   carry `verdict: APPROVE` or `verdict: COMMENT` **in its YAML
   frontmatter** (the tier-2 filter
   already enforced this; re-check a tier-1 explicit path). If no review
   artifact exists, or the latest verdict is REQUEST CHANGES, **refuse**:
   report that the design has not passed review and suggest
   `/team-design $ARGUMENTS` — never slice an unreviewed design.
2. Dispatch `structure-planner`, which writes `$ARGUMENTS/structure.md`
   with vertical slices. The artifact carries plain frontmatter
   (`topic`, `date`, `phase: structure`) — no approval fields, because
   structure is not gated.
3. **No gate. Nothing is presented for approval mid-run.** Within a full
   `/team` run the orchestrator advances
   to PLAN automatically; run standalone, this skill stops after writing the
   structure and reports the next command.
4. **Stop once `$ARGUMENTS/structure.md` exists.**

## Completion

Report the structure path. When run standalone, tell the user:
**"Next: run `/team-plan docs/plans/<id>/`"**
(Within a full `/team` run the orchestrator advances to PLAN automatically.)
