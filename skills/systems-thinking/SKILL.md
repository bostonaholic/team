---
name: systems-thinking
description: System-fit reasoning lens — loaded by researcher, structure-planner, and planner, and read inline by implementer, code-reviewer, and ux-reviewer to weigh a change's blast radius (callers, siblings, conventions) rather than only the diff in front of it
user-invocable: false
---

# Systems Thinking

A reasoning lens, not a gate. It produces no artifact of its own and
blocks nothing. It shapes how the judgment agents reason about the system
around a change. That system is the callers, consumers, sibling
implementations, and conventions that live outside the diff. Locally
correct work then also fits the whole.

## Core Lenses

Four lenses sharpen every research answer, design decision, slice boundary,
plan step, edit, and review finding:

- **Blast radius over diff radius**: The lines you change are rarely the
  whole change. Ask what else the system expects to move when this moves:
  callers, config, docs, tests, and sibling implementations. Treat that
  set as the real scope of the work.
- **Callers and siblings first**: Before judging or changing a component,
  find who calls it, who consumes its output, and which sibling
  implementations do the same job elsewhere. A change made without that map
  duplicates an existing solution or breaks a neighbor quietly.
- **Conventions are contracts**: The patterns established elsewhere in the
  codebase — naming, error handling, file layout, idioms — are implicit
  contracts with every reader and every future change. Diverging from one
  is a decision to surface and justify, never a silent default.
- **Leave the system consistent**: After the change, every sibling must
  still agree, every caller must still work, and every convention must
  still hold. Otherwise the divergence is named and deliberate.

## When Researching

Facts to gather for each component a research answer touches — recorded as
observations with file:line evidence, never as inferred intent:

- **Who calls it, and who consumes its output?** Map the callers and
  consumers of each component you answer about, so downstream phases see
  the full contact surface, not only the component itself.
- **What siblings do the same job?** Name the sibling implementations that
  follow the same pattern elsewhere, so later phases can keep them in
  agreement or reuse them instead of duplicating.
- **What conventions govern it?** Record the established conventions the
  component follows — as facts about the code as it stands, never as
  guesses about what the task might want.

## When Designing

Questions to apply while writing a design's `## Current state` and
`## Decisions made` sections:

- **What are the adjacent components?** Document the callers, consumers,
  and sibling implementations around the component being changed — not
  only the component itself.
- **What must change together?** For each decision, name the surfaces that
  must move with it — callers, siblings, config, docs. A decision that is
  silent about its neighbors is incomplete, not conservative.
- **Which conventions does the approach touch?** Where the design diverges
  from an established pattern, say so explicitly and give the reason.

## When Slicing

Questions to apply while drawing slice boundaries:

- **Does the slice include every co-changing surface?** A slice's scope is
  its blast radius, not its diff. The callers, siblings, docs, and config
  that must move together belong in the same slice.
- **Does any slice knowingly leave a caller or sibling broken?** No slice
  ships a state where a neighbor of something it touched no longer works.
  Re-draw the boundary rather than defer the breakage.

## When Planning

Questions to apply while writing file-level steps:

- **Is every call site an explicit step?** When a contract changes,
  enumerate each of its call sites as its own step — "update callers" is a
  hope, not a step.
- **Are co-changing doc and config surfaces in the slice?** Docs, schemas,
  and config that describe a changed surface move in the same slice as the
  change, never in a follow-up.

## When Implementing

Discipline to apply before and during each slice:

- **Does an implementation already exist?** Search for an existing
  implementation before adding one — extending or reusing the sibling
  beats writing a divergent twin.
- **Which callers does this edit affect?** Update every affected caller in
  the same slice. A locally green diff that breaks a neighbor is not done.
- **Does the edit match the local idiom?** Follow the conventions of the
  surrounding code, even where a different style would also work.

## When Reviewing

The questions behind the `System Fit` checklist item in
`skills/code-review/SKILL.md`, and the ux-reviewer's adjacent-flow check:

- **Does a sibling implementation now diverge?** Two components that did
  the same job the same way should still agree after the diff — flag the
  one left behind.
- **Does a caller or consumer outside the diff need updating?** Review the
  changed files *and* the neighbors whose expectations they carry.
- **Does the change follow the conventions established elsewhere?** Cite
  the specific convention when flagging a divergence, so the finding is
  checkable rather than a taste claim. Convention governs where no written
  rule speaks. Where one does, the rule wins and the precedent is a second
  violation rather than a defence — a pattern's presence on the default
  branch says it shipped, not that it is permitted.

## Lens, Not Dogma

This lens informs judgment. It never blocks the pipeline. On a greenfield
or single-file target there can be no callers, siblings, or conventions to
map. There, "none found" is a complete answer. Never manufacture findings
to satisfy the lens. The point is to keep "does this fit the system around
it?" in view — not to add ritual.
