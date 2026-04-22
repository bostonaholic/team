---
name: team-design
description: Align with the user on the approach before any code is written. The design-author MUST present open questions interactively before drafting the ~200-line design document, then a human gate captures approval. Trigger on "design this", "let's align on the approach", or "/team-design".
---

# TEAM Design — Standalone Phase

Run the DESIGN phase. Requires a research artifact on disk.

## Execution

1. Stat `docs/plans/<today>-<topic>-research.md`. If missing, report "No
   research found. Run /team-research first." and stop.
2. Follow the phase loop from `/team`. It dispatches `design-author`, which:
   a. Presents open questions to the user interactively
   b. Waits for answers
   c. Writes `docs/plans/<today>-<topic>-design.md`
3. At the human gate: present the design **in full** and ask "Do you
   approve this design?".
4. **Stop once `docs/plans/<today>-<topic>-design.md.approved` sidecar is
   touched, or the design has been re-dispatched for revision.**

## On revision

If the user rejects, pass the feedback verbatim to the design-author on
re-dispatch and increment `designRevisionCount` in `state.json`. The
design-author re-drafts. There is no auto-revision pass — the human is
the loop.

## Completion

Report design path and suggest: "/team-structure to break it into vertical slices"
