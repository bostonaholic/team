---
name: team-research
description: Research a codebase area before making changes. Dispatches parallel read-only agents (file-finder + researcher) that read questions.md only — never task.md. Trigger on "research this", "explore the codebase for", or "/team-research".
argument-hint: "[docs/plans/<id>/]"
---

# Team Research — Answer the Questions

Run the RESEARCH phase only, then stop. Research is **blind** — the
researcher and file-finder never see the user's original task description.
They read `questions.md` and nothing else.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery block below resolves it.

The dispatched agents receive `$ARGUMENTS/questions.md` and (when it
exists) `$ARGUMENTS/repos.md`. They do **not** read `task.md`.

Resolve the artifact directory by running this self-contained block (one bash
call — agent threads reset cwd between calls):

```sh
# Three-tier artifact-directory discovery (archetype A).
# ID_RE + PHASE_FILES canonical from hooks/session-start-recover.mjs:15-16.
# PHASE_FILES recency mirrors findActiveTopic (session-start-recover.mjs:29-49).
# NOTE: this block is duplicated across 8 skills by design (see docs/architecture.md); future: shared discover-topic.sh.
ID_RE='^([A-Za-z][A-Za-z0-9_]*-[0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2})-[a-z0-9][a-z0-9-]*$'
PHASE_FILES="task questions research design structure plan"
PRED="questions.md"            # predecessor artifact this skill consumes
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

- **If the block printed a path**, use it as `$ARGUMENTS` (tier 1 explicit arg,
  or tier 2 discovery). When the path came from tier 2 (no explicit arg),
  announce the resolved directory to the user before proceeding, so an
  auto-picked topic is never silent. Discovery resolves only the directory
  variable — the dispatch step below still forwards exactly
  `{questions.md, repos.md?}`.
- **If the block printed nothing** (tier 3 — no directory holds `questions.md`),
  do not hard-error. Fire `AskUserQuestion` with a `Setup` header and labeled
  options:
  - **Run the producer** — run `/team-question <description>` to produce the
    missing `questions.md`.
  - **Provide a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).

## Execution

1. Use the directory resolved in `## Input`.
2. Dispatch `file-finder` and `researcher` in **parallel**, passing each
   the path `$ARGUMENTS/questions.md`. If `$ARGUMENTS/repos.md` exists,
   include its path too — `repos.md` carries scope (which repos and
   where) without leaking intent. Do **not** pass the original
   description, `task.md`, or any framing.
3. Combine their returned content into a single `research.md` written to
   `$ARGUMENTS/research.md` with the required frontmatter (see the
   researcher agent for the schema). The `topic` value MUST be read
   from `$ARGUMENTS/questions.md`'s frontmatter and copied verbatim —
   never improvised, never combined with the ticket id. In multi-repo
   mode, preserve the repo-slug prefix on every file reference (e.g.
   `frontend:src/App.tsx:42`).
4. **Stop once `$ARGUMENTS/research.md` exists** — do not continue to
   DESIGN.

## Blindness invariant

- The orchestrator passes blind agents only `questions.md` (and
  optionally `repos.md` for scope). Never `task.md`, never the
  description.
- Blind agent system prompts forbid reading `task.md`. They are allowed
  to read `repos.md` because it carries scope, not intent.
- If the agents need context the questions lack, they must surface it as
  an open question rather than guessing intent.

If you suspect leakage (e.g., research references a goal not stated in
`questions.md`), treat it as a defect and re-dispatch with a fresh agent.

## Completion

Report:

- Path to `$ARGUMENTS/research.md`
- Key findings (3–5 bullets)
- Open questions count
- Tell the user: **"Next: run `/team-design docs/plans/<id>/`"**
