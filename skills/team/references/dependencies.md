# System dependency checks

A reasoning lens for co-changing callers and siblings. It produces no artifact and blocks nothing. Read it before judging or changing a component whose neighbors share its contracts.

## Core lenses

- **Blast radius over diff radius** — the lines a change edits are rarely the whole change. Include callers, config, docs, tests, and sibling implementations that must change together.
- **Callers and siblings first** — find consumers and comparable implementations before judging or changing a component.
- **Conventions are contracts** — follow established naming, errors, layout, and idioms unless a documented decision requires divergence.
- **Leave the system consistent** — callers work and siblings agree, or every divergence is explicit.

## When researching

Record `file:line` evidence for callers, consumers, siblings, and conventions. State observed code facts, never inferred task intent.

## When designing

In `## Current state`, name adjacent components. In `## Decisions made`, name every surface that must change together and each deliberate convention departure.

## When slicing

Keep co-changing callers, siblings, docs, and config in one slice. No slice may leave a touched neighbor broken.

## When planning

Give every call site its own step. Include co-changing docs, schemas, and config in the same slice, not a follow-up.

## When implementing

Search for an existing implementation first. Update all affected callers in the same slice. Match the surrounding idiom.

## When reviewing

Does a sibling diverge? Does a caller or consumer outside the diff need change? Does the change follow conventions established elsewhere? Cite the convention. Convention governs where no written rule speaks; a written rule outranks observed precedent.

## Lens, not dogma

This lens informs judgment and never blocks. Greenfield or single-file work can have no callers, siblings, or conventions; "none found" is a complete answer. Never manufacture findings.
