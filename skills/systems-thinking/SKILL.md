---
name: systems-thinking
description: Check callers, siblings, contracts, and conventions when researching, designing, planning, implementing, or reviewing.
user-invocable: false
---

# Systems Thinking

This lens creates no artifact and never gates the pipeline.

## Core Lenses

- **Blast radius over diff radius**: include co-changing callers, config, docs,
  tests, and siblings.
- **Callers and siblings first**: find consumers and existing implementations.
- **Conventions are contracts**: justify deviations from established patterns.
- **Leave the system consistent**: keep every caller and sibling working.

## When Researching

Record callers, consumers, siblings, and conventions with `file:line`
evidence. Report facts, not inferred intent.

## When Designing

Document adjacent components in Current state. For every decision, name
surfaces that must change together and any convention it departs from.

## When Slicing

Keep co-changing code, tests, docs, config, callers, and siblings in the same
passing slice. No slice may knowingly leave a neighbor broken.

## When Planning

Enumerate each affected call site as a file-level step. Include co-changing
docs, schemas, and configuration.

## When Implementing

Search for existing implementations first, update every affected caller in the
same slice, and follow the local idiom.

## When Reviewing

Apply the System Fit check in `skills/reviewing-code/SKILL.md`: find sibling
divergence, callers or consumers outside the diff, and conventions established
elsewhere. Cite the convention. Convention governs where no written rule
speaks; a written rule wins over precedent.

## Lens, Not Dogma

For greenfield or single-file work, `none found` is a complete answer. Do not
manufacture findings.
