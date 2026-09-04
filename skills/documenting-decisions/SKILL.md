---
name: documenting-decisions
description: 'Defines ADR structure and lifecycle. Load when recording a consequential architecture decision and its alternatives.'
user-invocable: false
---

# Documenting Decisions

An Architecture Decision Record (ADR) records an important technical choice, its context, alternatives, and consequences. Write at seventh-grade, STE-flavored level; call the Skill tool with `writing-prose` and apply `## Self-lint` before finalizing.

## ADR Format

```markdown
# NNNN. Decision Title

## Status
Proposed | Accepted | Deprecated | Superseded by [NNNN](NNNN-title.md)

## Context
<Objective facts: problem, technical/business constraints, team capability, and timeline.>

## Decision
<Active-voice decision: “We will…”, never “It was decided that…”.>

## Consequences
<What becomes easier and harder; include positive and negative trade-offs.>
```

## File Convention

Store ADRs under `docs/decisions/` with zero-padded sequence names: `0001-use-typescript-for-plugin.md`, `0002-agent-per-phase-architecture.md`, `0003-file-based-state-management.md`. Read existing files, increment the highest number, or start at `0001` when absent/empty.

## When to Write an ADR

Write one when choosing among alternatives, accepting important trade-offs, breaking an established convention, or adding a long-lived dependency. For dependencies, record why it beat alternatives and the exit strategy.

Do not write one for an obvious choice, use of an established pattern, minor implementation details (names, variable scope, loop form), or a choice reversible in minutes without downstream effects.

## Status rules

- **Proposed:** open for discussion. **Accepted:** in effect; code must conform. **Deprecated:** retained after its subject disappears.
- **Superseded:** link the successor as `Superseded by [0007](0007-new-approach-to-state.md)`; the successor names the prior ADR in Context so navigation works both ways.

## Writing rules

- State specific facts and reasons; name rejected alternatives and why.
- Record incomplete information so later readers know when to reconsider.
- Keep it readable in under 5 minutes; implementation detail belongs in code or comments.
