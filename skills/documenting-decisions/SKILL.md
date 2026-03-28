---
name: documenting-decisions
description: Architecture Decision Record creation and management — loaded by planner and orchestrator when significant technical decisions need to be recorded with context and consequences
---

# Documenting Decisions

Architecture Decision Records (ADRs) capture significant technical decisions
with their context, rationale, and consequences. They are the institutional
memory that explains WHY the codebase looks the way it does.

## ADR Format

Every ADR follows this structure:

```markdown
# NNNN. Decision Title

## Status

Proposed | Accepted | Deprecated | Superseded by [NNNN](NNNN-title.md)

## Context

What is the issue that we're seeing that is motivating this decision or change?
Describe the forces at play — technical constraints, business requirements,
team capabilities, timeline pressure. Be objective: state facts, not opinions.

## Decision

What is the change that we're proposing and/or doing? State the decision in
full sentences, using active voice: "We will..." not "It was decided that..."

## Consequences

What becomes easier or more difficult to do because of this change? List both
positive and negative consequences. Every decision has trade-offs — if you
cannot identify any negative consequences, you have not thought hard enough.
```

## File Convention

ADRs live in `docs/decisions/` with zero-padded sequential numbering:

```
docs/decisions/
  0001-use-typescript-for-plugin.md
  0002-agent-per-phase-architecture.md
  0003-file-based-state-management.md
```

To determine the next number, read the existing files in `docs/decisions/`
and increment the highest number. If the directory is empty or does not exist,
start at `0001`.

## When to Write an ADR

Write an ADR when the decision:

- **Chooses between alternatives** — You evaluated multiple options and picked
  one. The rejected alternatives and the reasons for rejection are valuable
  context for future developers who will wonder "why didn't we just..."

- **Involves significant trade-offs** — The decision sacrifices something
  (performance, simplicity, flexibility) to gain something else. Record what
  was traded and why.

- **Breaks an established convention** — Deviating from existing patterns is
  sometimes correct, but the reasoning must be explicit so the deviation is
  not "fixed" back by a future developer who assumes it was a mistake.

- **Introduces a new dependency** — Adding a library, service, or tool creates
  a long-term commitment. Record why this dependency was chosen over
  alternatives and what the exit strategy is.

## When NOT to Write an ADR

Do not write an ADR when:

- **The choice is obvious** — If there is one clearly correct option and no
  reasonable alternative, an ADR adds bureaucratic overhead without value.

- **Following established patterns** — If the codebase already uses a pattern
  and you are applying it to a new case, no decision was made.

- **Minor implementation details** — Function naming, variable scoping, loop
  structure. These are code-level decisions, not architecture-level.

- **The decision is trivially reversible** — If the choice can be changed in
  minutes with no downstream impact, it does not need formal documentation.

## ADR Statuses

### Proposed

The decision has been written but not yet accepted. It is open for discussion
and may be modified.

### Accepted

The decision has been agreed upon and is in effect. The codebase should
conform to this decision.

### Deprecated

The decision is no longer relevant — the feature or system it pertains to has
been removed. The ADR remains for historical context.

### Superseded

A newer decision has replaced this one. The ADR must include a reference to
its successor:

```markdown
## Status

Superseded by [0007](0007-new-approach-to-state.md)
```

The successor ADR should reference what it supersedes in its Context section
to maintain the decision trail.

## Writing Guidance

- **Be specific.** "We chose X because it is better" is not useful. "We chose
  X because it supports concurrent writes without locking, which Y does not"
  is useful.
- **Name the alternatives.** Every decision implies rejected alternatives.
  List them and say why they were rejected.
- **Acknowledge uncertainty.** If the decision was made with incomplete
  information, say so. Future readers will know to re-evaluate if new
  information emerges.
- **Keep it short.** An ADR should be readable in under 5 minutes. If it
  takes longer, you are including implementation details that belong in code
  or comments.
