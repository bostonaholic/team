---
name: team-design
description: Align with the user on the approach before any code is written. The design-author MUST present open questions interactively before drafting the ~200-line design document, then a human gate captures approval. Trigger on "design this", "let's align on the approach", or "/team-design".
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team Design — Where Are We Going?

Run the DESIGN phase. This is the pipeline's only human gate — get
alignment here before investing in detailed planning.

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
# Three-tier artifact-directory discovery (archetype A) — shared script.
# Single source: skills/qrspi-workflow/discover-topic.sh (was duplicated 8x).
# Args: <pred> <require_approved> <explicit_dir>; scans docs/plans/ in cwd.
bash "${CLAUDE_PLUGIN_ROOT}/skills/qrspi-workflow/discover-topic.sh" "research.md" "" "$ARGUMENTS"
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
