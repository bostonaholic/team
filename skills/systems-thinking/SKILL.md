---
name: systems-thinking
description: 'Defines systems thinking methodology. Load when agents need its procedure.'
user-invocable: false
---

# Systems Thinking

Use this reasoning lens without creating an artifact or gate. For expanded
questions and examples, read [references/lenses.md](references/lenses.md).

## Core Lenses

- **Blast radius over diff radius** — include callers, config, docs, tests, and
  siblings that must change together.
- **Callers and siblings first** — find consumers and comparable implementations
  before judging or changing a component.
- **Conventions are contracts** — follow established naming, errors, layout, and
  idioms unless a documented decision requires divergence.
- **Leave the system consistent** — callers work and siblings agree, or every
  divergence is explicit.

## When Researching

Record `file:line` evidence for callers, consumers, siblings, and conventions.
State observed code facts, never inferred task intent.

## When Designing

In Current state, name adjacent components. In Decisions made, name every
surface that must change together and each deliberate convention departure.

## When Slicing

Keep co-changing callers, siblings, docs, and config in one slice. No slice may
leave a touched neighbor broken.

## When Planning

Give every call site its own step. Include co-changing docs, schemas, and config
in the same slice, not a follow-up.

## When Implementing

Search for existing implementations first. Update all affected callers in the
same slice. Match the surrounding idiom.

## When Reviewing

Apply `System Fit` from `skills/reviewing-code/SKILL.md`:

- Did a sibling diverge?
- Does a caller or consumer outside the diff need change?
- Does the change follow conventions established elsewhere?

Cite the convention. Convention governs where no written rule speaks. Where a
written rule speaks, it outranks observed precedent.

## Lens, Not Dogma

This lens informs judgment and never blocks. Greenfield or single-file work can
have no callers, siblings, or conventions. “none found” is a complete answer;
never manufacture findings.
