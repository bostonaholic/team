---
name: technical-design-doc
description: Technical design document methodology — loaded by the planner agent when producing implementation plans for features that warrant architecture documentation, trade-off analysis, and rollout planning
---

# Technical Design Document

A technical design document (TDD) captures the architecture, trade-offs, and
rollout plan for a significant feature before implementation begins. Not every
feature needs a full TDD — apply this methodology when a feature is complex
enough that undocumented architectural decisions would slow or block
implementation.

## When to Write a TDD

Write a TDD when the feature:

- **Introduces a new architectural pattern** not already established in the
  codebase (new data store, new service boundary, new async pattern)
- **Has multiple valid approaches** with real trade-offs worth documenting
  before committing to one
- **Touches multiple subsystems** and requires coordination across components
- **Has a non-trivial rollout** (schema migration, backward compatibility
  requirements, phased rollout, feature flag)
- **Has significant performance or security implications** that need
  deliberate design

When in doubt: if the plan would benefit from having the architectural
decisions documented alongside the steps, write the TDD section.

## TDD Structure

### Problem Statement

One to three sentences: what problem does this feature solve, and why does
it need to be solved now? This grounds every subsequent decision in context.

### Goals and Non-Goals

**Goals:** What the feature must accomplish. State measurable outcomes where
possible. This section defines scope.

**Non-Goals:** What the feature explicitly does NOT do. Non-goals are as
important as goals — they prevent scope creep and answer "why didn't you
also do X?" questions in advance.

### Background

Context a reader needs to understand the design: relevant existing components,
prior art in the codebase, constraints inherited from other systems. Keep this
to what a new contributor would need to evaluate the design choices.

### Design

The core of the TDD. Describe the architecture of the solution:

#### Data Model

If the feature introduces new data structures, describe them. For databases:
table names, columns, types, indexes, foreign keys. For in-memory: type
definitions, invariants, lifecycle.

#### API / Interface

What new interfaces does this feature expose? HTTP endpoints, function
signatures, event schemas, CLI commands. Be precise — these become the
contract downstream agents implement against.

#### Key Components

Which existing components are modified? Which new components are introduced?
For each:
- What is its single responsibility?
- What does it consume and produce?
- What are its dependencies?

#### Sequence / Flow

For features with non-obvious control flow, describe the sequence of
operations from trigger to completion. A numbered list or ASCII sequence
diagram works well.

### Trade-offs Considered

Every design choice implies rejected alternatives. For each major decision:

```
**Decision:** What was chosen.

**Alternatives considered:**
- Alternative A — why rejected
- Alternative B — why rejected

**Risk:** What could go wrong with the chosen approach, and how it is mitigated.
```

### Rollout Plan

How will this feature be deployed safely?

- **Migration strategy:** If the feature changes data or APIs, how is
  compatibility maintained during the transition?
- **Feature flags:** If the feature should be enabled gradually, what flags
  exist and what gates them?
- **Rollback plan:** If the feature needs to be reverted, what does that
  require? Is it reversible?
- **Monitoring:** What metrics or logs will confirm the feature is working
  correctly in production?

### Open Questions

Unresolved decisions that must be answered before implementation begins.
List them explicitly so they are not silently assumed. Each open question
should include who must answer it and when.

## When the Planner Should Use This Methodology

The planner agent loads this methodology when:

1. The research artifact identifies multiple valid approaches or significant
   architectural decisions.
2. The feature introduces new patterns or touches multiple subsystems.
3. The plan artifact warrants richer documentation than the standard plan
   format provides.

In these cases, the planner produces an enhanced plan that includes TDD
sections (trade-offs, data model, rollout) alongside the standard phases,
steps, and done criteria.

For smaller features, the standard plan format is sufficient — do not add
TDD sections for their own sake. A well-structured plan without TDD overhead
is better than an incomplete TDD that delays implementation.

## Integration With the Standard Plan Format

When producing an enhanced plan, add TDD sections after the Context section
and before the Steps section:

```markdown
### Context
...

### Trade-offs
...

### Data Model (if applicable)
...

### Rollout Plan (if applicable)
...

### Steps
...

### Tests
...

### Done Criteria
...
```

Keep the total plan under 300 lines. If the TDD content would push the plan
over that limit, extract the TDD to a separate file in `docs/plans/` and
reference it from the plan.
