---
name: team-design
description: Align with the user on the approach before any code is written. The design-author MUST present open questions interactively before drafting the ~200-line design document, then a human gate captures approval. Trigger on "design this", "let's align on the approach", or "/team-design".
argument-hint: "docs/plans/<id>/"
---

# TEAM Design — Where Are We Going?

Run the DESIGN phase. This is the first human gate — get alignment here
before investing in detailed planning.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`.

The `design-author` reads:

- `$ARGUMENTS/task.md` — what we're building (intent)
- `$ARGUMENTS/questions.md` — the questions that drove research
- `$ARGUMENTS/research.md` — what exists (facts)

If `$ARGUMENTS/research.md` is missing, tell the user to run
`/team-research docs/plans/<id>/` first and stop.

## Execution

1. **Verify** `$ARGUMENTS/research.md` exists.
2. Dispatch `design-author`, which:
   a. Presents 3–5 open design questions to the user **interactively**
   b. Waits for answers
   c. Writes `$ARGUMENTS/design.md` with frontmatter
      `approved: false`, `approved_at: null`, `revision: 0`
3. **Human gate.** Present the design **in full** and ask: "Do you
   approve this design?"
   - On approve → edit `$ARGUMENTS/design.md` frontmatter to set
     `approved: true` and `approved_at: <ISO-8601>`.
   - On reject → re-dispatch `design-author` with the user's feedback
     verbatim. The agent re-drafts and increments `revision: <n+1>`.
     Cap at `revision: 5`; beyond that, escalate to the user.
4. **Stop once `$ARGUMENTS/design.md` carries `approved: true`.**

## Completion

Report design path and tell the user:
**"Next: run `/team-structure docs/plans/<id>/`"**
