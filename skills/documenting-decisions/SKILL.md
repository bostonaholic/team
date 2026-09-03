---
name: documenting-decisions
description: Write or update Architecture Decision Records for consequential technical choices.
user-invocable: false
---

# Documenting Decisions

## Input

Write an Architecture Decision Record only for a consequential choice between
alternatives: a material trade-off, convention break, or new dependency. Skip
obvious, established, minor, or trivially reversible choices.

Call the Skill tool with `writing-prose` and apply its `## Self-lint` in
STE-flavored mode.

## Required output

Create the next zero-padded file in `docs/decisions/`, starting at `0001`:

```markdown
# NNNN. Decision Title

## Status
Proposed | Accepted | Deprecated | Superseded by [NNNN](NNNN-title.md)

## Context
<facts and forces that require a choice>

## Decision
<active-voice decision and named rejected alternatives>

## Consequences
<positive and negative effects, uncertainty, and exit strategy>
```

When superseded, link both records to each other. Keep the record under five
minutes to read; omit implementation detail.

## Done

The ADR names the choice, alternatives, trade-offs, status, and consequences.
