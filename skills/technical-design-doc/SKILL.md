---
name: technical-design-doc
description: Write or evaluate a technical design document for consequential technical choices.
user-invocable: false
---

# Technical Design Document

## Input

Use a TDD for a new architecture pattern, multiple viable approaches,
cross-subsystem coordination, non-trivial rollout, or material
performance/security implications. Skip it for a small established-pattern
change.

Call the Skill tool with `writing-prose` and apply its `## Self-lint` in
STE-flavored mode.

## Required output

### Problem Statement

State the problem and why it needs action.

### Goals and Non-Goals

Define measurable outcomes and explicit exclusions.

### Background

Give only the existing components, prior art, and constraints needed to judge
the design.

### Design

Specify applicable data invariants, APIs/interfaces, component inputs and
outputs, dependencies, and non-obvious sequence.

#### Edge Cases and Failure Modes

Choose behavior for boundary and invalid inputs, downstream failure and
partial writes, concurrency/idempotency, authorization, and resource limits.
Put intentionally excluded cases in Non-Goals.

### Trade-offs Considered

For each major choice, name the decision, rejected alternatives and reasons,
risk, and mitigation.

### Rollout Plan

State migration compatibility, feature-flag behavior, rollback steps, and
production metrics/logs.

### Open Questions

Name each unresolved decision, owner, and deadline. Resolve it before
implementation.

For an enhanced plan, place Trade-offs, optional Data Model, and optional
Rollout Plan between Context and Steps. Keep a plan under 300 lines; otherwise
write a separate TDD under `docs/plans/` and link it.

## Done

The document fixes scope, interfaces, failure behavior, trade-offs, rollout,
and all decisions needed to implement.
