---
name: solid
description: Apply SOLID principles when writing or reviewing object-oriented code.
user-invocable: false
---

# SOLID Principles

## Input

Apply to object-oriented code being designed or reviewed.

## Required checks

- **S — Single Responsibility:** one actor-driven reason to change. Split
  units with unrelated jobs or names requiring “and.”
- **O — Open/Closed:** add variants through an existing extension contract,
  not a growing type switch or hardcoded list.
- **L — Liskov Substitution:** every subtype preserves base preconditions,
  postconditions, and behavior. Prefer composition when “is-a” is false.
- **I — Interface Segregation:** no client depends on methods it does not use;
  split interfaces that force unsupported methods or irrelevant test stubs.
- **D — Dependency Inversion:** business logic depends on injected
  abstractions, not database, HTTP, filesystem, static infrastructure calls,
  or hidden singletons.

Construct with long-lived collaborators and call with per-request work.
Constructors perform no I/O, lookup, or computation.

## Output

For each violation, name the principle, cite `file:line`, and state its
present consequence:

> `issue: SRP violation — this function handles both validation and storage.`

A finding without a principle and consequence is not actionable.
