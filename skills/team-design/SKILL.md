---
name: team-design
description: Align with the user on the approach before any code is written. The design-author MUST present open questions interactively before drafting the ~200-line design document, then a human gate captures approval. Trigger on "design this", "let's align on the approach", or "/team-design".
---

# TEAM Design — Standalone Phase

Run the DESIGN phase. Two modes:

- **Resume mode** — research artifact exists; design-author consumes it.
- **Standalone mode** — no research yet, but `$ARGUMENTS` provides a
  description. Bootstrap the missing upstream artifacts before designing.

## Input

`$ARGUMENTS` may be:

- Empty — resume mode. Requires existing research on disk.
- A beads issue ID — resolve via `/beads:show <id>`.
- Free-form text — treated as the feature/task description.

## Execution

1. Stat `docs/plans/<today>-<topic>-research.md`.
2. **If missing and `$ARGUMENTS` is non-empty** — bootstrap by chaining
   inline: dispatch `questioner` to produce Question artifacts, then
   dispatch `file-finder` + `researcher` in parallel to produce
   `research.md`. Continue to design without prompting the user to re-run
   earlier commands.
3. **If missing and `$ARGUMENTS` is empty** — ask the user to describe
   the feature, then bootstrap as above. If still empty, stop.
4. Follow the phase loop from `/team`. It dispatches `design-author`, which:
   a. Presents open questions to the user interactively
   b. Waits for answers
   c. Writes `docs/plans/<today>-<topic>-design.md`
5. At the human gate: present the design **in full** and ask "Do you
   approve this design?".
6. **Stop once `docs/plans/<today>-<topic>-design.md` carries
   `approved: true` in its frontmatter, or the design has been
   re-dispatched for revision.**

## On revision

If the user rejects, pass the feedback verbatim to the design-author on
re-dispatch. The design-author re-drafts and increments
`revision: <n+1>` in the new draft's frontmatter (cap 5; beyond that,
escalate to the user). There is no auto-revision pass — the human is
the loop.

## Completion

Report design path and suggest: "/team-structure to break it into vertical slices"
