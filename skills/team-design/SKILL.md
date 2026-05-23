---
name: team-design
description: Align with the user on the approach before any code is written. The design-author MUST present open questions interactively before drafting the ~200-line design document, then a human gate captures approval. Trigger on "design this", "let's align on the approach", or "/team-design".
argument-hint: "docs/plans/<id>/"
---

# Team Design — Where Are We Going?

Run the DESIGN phase. This is the first human gate — get alignment here
before investing in detailed planning.

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
# ID_RE + PHASE_FILES canonical from hooks/session-start-recover.mjs:15-16.
# PHASE_FILES recency mirrors findActiveTopic (session-start-recover.mjs:29-49).
ID_RE='^([A-Za-z][A-Za-z0-9_]*-[0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2})-[a-z0-9][a-z0-9-]*$'
PHASE_FILES="task questions research design structure plan"
PRED="research.md"            # predecessor artifact this skill consumes
# Tier 1 — explicit: $ARGUMENTS names an existing dir → use verbatim.
if [ -n "$ARGUMENTS" ] && [ -d "$ARGUMENTS" ]; then
  echo "$ARGUMENTS"; exit 0
fi
# Tier 2 — discover: newest ID_RE dir under docs/plans/ that holds PRED.
best=""; best_mtime=-1
for d in docs/plans/*/; do
  name="$(basename "$d")"
  printf '%s' "$name" | grep -qE "$ID_RE" || continue   # ID_RE filter
  [ -f "$d$PRED" ] || continue                          # predecessor filter
  m=-1
  for p in $PHASE_FILES; do
    f="$d$p.md"
    [ -f "$f" ] || continue                             # skip racing/absent
    s="$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null)" || continue
    [ "${s:-0}" -gt "$m" ] && m="$s"                    # max-mtime over PHASE_FILES
  done
  [ "$m" -gt "$best_mtime" ] && { best_mtime="$m"; best="$d"; }
done
[ -n "$best" ] && { echo "$best"; exit 0; }
# Tier 3 — none found: print nothing → fall to AskUserQuestion (prose below).
```

- **If the block printed a path**, use it as `$ARGUMENTS` for the rest of this
  skill (tier 1 explicit arg, or tier 2 discovery).
- **If the block printed nothing** (tier 3 — no directory holds `research.md`),
  do not hard-error. Fire `AskUserQuestion` with a `Setup` header and labeled
  options:
  - **Run the producer** — run `/team-research docs/plans/<id>/` to produce the
    missing `research.md`.
  - **Provide a path** — the user supplies the `docs/plans/<id>/` directory
    directly.

## Execution

1. Use the directory resolved in `## Input`.
2. Dispatch `design-author`, which:
   a. Presents 3–5 open design questions to the user via the built-in
      `AskUserQuestion` tool (multi-choice with labeled trade-offs)
   b. Waits for the user's structured answers
   c. Writes `$ARGUMENTS/design.md` with frontmatter
      `approved: false`, `approved_at: null`, `revision: 0`
3. **Human gate.** Present the design **in full**, then use
   `AskUserQuestion` to capture the verdict. Use a single question with a
   `Decision` header and these options:
   - **Approve** — design is ready; advance to STRUCTURE.
   - **Request changes** — describe what to revise; re-dispatch
     `design-author` with the user's feedback verbatim.
   - **Reject** — abandon this design and start over.

   - On Approve → edit `$ARGUMENTS/design.md` frontmatter to set
     `approved: true` and `approved_at: <ISO-8601>`.
   - On Request changes → re-dispatch `design-author` with the user's
     feedback verbatim. The agent re-drafts and increments
     `revision: <n+1>`. Cap at `revision: 5`; beyond that, escalate to
     the user.
4. **Stop once `$ARGUMENTS/design.md` carries `approved: true`.**

## Completion

Report design path and tell the user:
**"Next: run `/team-structure docs/plans/<id>/`"**
