---
name: team-structure
description: Break the approved design into vertical slices with verification checkpoints. The structure document is the human's last review point before code is written. Trigger on "slice this up", "break the design into steps", or "/team-structure".
---

# TEAM Structure — Standalone Phase

Run the STRUCTURE phase. Two modes:

- **Resume mode** — `design.md` carries `approved: true` in its
  frontmatter; structure-planner consumes the approved design.
- **Standalone mode** — no approved design, but the user wants to plan
  vertical slices directly. Bootstrap the missing upstream artifacts.

## Input

`$ARGUMENTS` may be:

- Empty — resume mode. Requires `design.md` on disk with
  `approved: true` in its frontmatter.
- A ticket ID — recorded as `ticketId` in `task.md` for the user's reference. The orchestrator does not call any ticketing system.
- Free-form text — treated as the feature/task description.
- A path to an existing design-like document — accepted as the design.

## Execution

1. Read `docs/plans/<today>-<topic>-design.md` and check the frontmatter
   for `approved: true`.
2. **If missing and `$ARGUMENTS` is non-empty** — bootstrap by chaining
   inline: produce Question + Research + Design artifacts, then run the
   design human gate. After approval, continue to structure.
3. **If missing and `$ARGUMENTS` is empty** — ask the user for a
   description; if still empty, stop.
4. Follow the phase loop from `/team`. It dispatches `structure-planner`,
   which writes `docs/plans/<today>-<topic>-structure.md` with vertical
   slices.
5. At the human gate: present the structure **in full** and ask "Do you
   approve this structure?".
6. **Stop once `docs/plans/<today>-<topic>-structure.md` carries
   `approved: true` in its frontmatter, or the structure has been
   re-dispatched for revision.**

## On revision

If the user rejects, pass the feedback verbatim to the structure-planner
on re-dispatch. The structure-planner re-drafts and increments
`revision: <n+1>` in the new draft's frontmatter (cap 5; beyond that,
escalate to the user).

## Completion

Report structure path and suggest: "/team-plan to produce the tactical plan"
