---
name: technical-design-doc
description: 'Defines technical design doc methodology. Load when agents need its procedure.'
user-invocable: false
---

# Technical Design Document

Use a TDD for new architecture, material alternatives, multiple subsystems,
non-trivial rollout, or important performance/security decisions. Otherwise
use the standard plan. Read [references/template.md](references/template.md)
before authoring; it owns the full prompts, examples, and enhanced-plan layout.
Apply `writing-prose` in STE-flavored mode and run its Self-lint.

## TDD contract

### Problem Statement

State the problem and why it needs action now in one to three sentences.

### Goals and Non-Goals

List measurable outcomes and explicit scope exclusions.

### Background

Give only the components, prior art, and constraints needed to judge the design.

### Design

Specify architecture and these applicable contracts:

- **Data Model:** names, fields, types, indexes, keys, invariants, lifecycle.
- **API / Interface:** endpoints, signatures, event schemas, or CLI commands.
- **Key Components:** responsibility, inputs, outputs, dependencies.
- **Sequence / Flow:** trigger-to-completion order.

#### Edge Cases and Failure Modes

State behavior for boundary values, invalid inputs, downstream failures,
timeouts, partial writes, retries, concurrency, idempotency, races,
authorization, and resource limits. Put deliberate exclusions in Non-Goals.

### Trade-offs Considered

For every major choice, record the decision, each serious alternative and why
it lost, plus the chosen approach's risk and mitigation.

### Rollout Plan

Cover migration/compatibility, feature flags, rollback/reversibility, and
production metrics or logs.

### Open Questions

List unresolved decisions, owner, and answer deadline. Resolve them before
implementation begins.

## Plan integration

For an enhanced plan, place TDD sections after Context and before Steps. Keep
the plan under 300 lines. If TDD content would exceed that limit, put it in a
separate file under `docs/plans/` and reference it from the plan.
