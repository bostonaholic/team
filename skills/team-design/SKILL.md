---
name: team-design
description: Align with the user on the approach before any code is written. The design-author MUST present open questions interactively before drafting the ~200-line design document, then a human gate captures approval. Trigger on "design this", "let's align on the approach", or "/team-design".
---

# TEAM Design — Standalone Phase

Run the DESIGN phase. Requires `research.completed` in the event log.

## Execution

1. Read `~/.team/<topic>/events.jsonl`. Scan for `research.completed`.
2. If not found: report "No research found. Run /team-research first." and stop.
3. Follow the event loop from `skills/team/registry.json`. This dispatches
   `design-author`, which:
   a. Presents open questions to the user interactively
   b. Waits for answers
   c. Writes `docs/plans/<today>-<topic>-design.md`
4. At the human gate (`design.drafted`): present the design **in full** and
   ask "Do you approve this design?".
5. **Stop after `design.approved` or `design.revision-requested` is recorded.**

## On revision

If the user rejects, capture their feedback verbatim into the
`design.revision-requested` event. The design-author re-drafts on the next
loop iteration. There is no auto-revision pass — the human is the loop.

## Completion

Report design path and suggest: "/team-structure to break it into vertical slices"
