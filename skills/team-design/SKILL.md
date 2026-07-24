---
name: team-design
description: Decide the approach before any code is written. The design-author drafts the ~200-line design document, resolving its own open questions autonomously as recorded assumptions, then an adversarial design review gates advancement. Trigger on "design this", "let's align on the approach", or "/team-design".
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team Design — Where Are We Going?

Run the DESIGN phase. The design-author decides the approach — recording
every self-resolved choice as an auditable assumption — and the
adversarial design review gates advancement. No mid-run prompt fires.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery block below resolves it.

The `design-author` reads:

- `$ARGUMENTS/task.md` — what we're building (intent)
- `$ARGUMENTS/questions.md` — the questions that drove research
- `$ARGUMENTS/research.md` — what exists (facts)

Resolve the artifact directory by running this self-contained block (one bash
call — agent threads reset cwd between calls):

```sh
# Three-tier artifact-directory discovery (archetype A).
# ID_RE + PHASE_FILES canonical from hooks/session-start-recover.mjs.
# PHASE_FILES recency mirrors findActiveTopic() in session-start-recover.mjs.
# NOTE: this block is duplicated across 8 skills by design (see docs/architecture.md); future: shared discover-topic.sh.
ID_RE='^([A-Za-z][A-Za-z0-9_]*-[0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2})-[a-z0-9][a-z0-9-]*$'
PHASE_FILES="task questions research design structure plan"
PRED="research.md"            # predecessor artifact this skill consumes
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
  skill (tier 1 explicit arg, or tier 2 discovery). When the path came from
  tier 2 (no explicit arg), announce the resolved directory to the user before
  proceeding, so an auto-picked topic is never silent.
- **If the block printed nothing** (tier 3 — no directory holds `research.md`),
  do not hard-error. Fire `AskUserQuestion` with a `Setup` header and labeled
  options:
  - **Run the producer** — run `/team-research docs/plans/<id>/` to produce the
    missing `research.md`.
  - **Provide a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).

## Execution

> Follow `skills/progress-tracking/SKILL.md`: when this procedure has two or more steps, seed one todo item per step before starting and mark each complete as you go.

1. Use the directory resolved in `## Input`.
2. Dispatch `design-author`, which:
   a. Resolves its own open questions autonomously, recording each in
      `## Decisions made` marked as an assumption (see the agent file)
   b. Writes `$ARGUMENTS/design.md` with frontmatter `revision: 0`

   If `$ARGUMENTS/design.md` already exists, skip this dispatch and
   resume at step 3 — never re-draft an existing design.
3. **Design review gate.** If the latest
   `$ARGUMENTS/design-review-<n>.md` already carries a passing verdict
   (APPROVE or COMMENT), skip straight to step 4 — never re-review a
   passed design. Otherwise dispatch the adversarial design review (the
   `## Review brief` in `skills/eng-design-doc-review/SKILL.md`, run by
   a fresh-context read-only `Explore` subagent each round) and write
   the findings + verdict to `$ARGUMENTS/design-review-<n>.md`, where
   `<n>` is the highest existing `<n>` + 1 (1 when none exists) — never
   overwrite an earlier verdict record:
   - **APPROVE or COMMENT** — the review passes; advance.
   - **REQUEST CHANGES** — re-dispatch `design-author` with the
     reviewer's findings verbatim. The agent re-drafts and increments
     `revision: <n+1>`, then a fresh review round runs. Cap at
     `revision: 5`; at cap, halt terminally and report the unresolved
     findings. Recovery: a human revises `$ARGUMENTS/design.md` by
     hand and re-invokes `/team-design` bare — the run resumes at this
     gate. The `revision` counter persists in `design.md` frontmatter;
     hand-lower it to restore the revision budget.
   - **Unparseable verdict or reviewer crash** — retry the review once
     with the error; on second failure, halt loudly. Fail closed —
     never advance on a missing verdict.
4. **Stop once `$ARGUMENTS/design.md` exists and the latest
   `$ARGUMENTS/design-review-<n>.md` verdict is APPROVE or COMMENT.**

## Completion

Report design path and tell the user:
**"Next: run `/team-structure docs/plans/<id>/`"**
