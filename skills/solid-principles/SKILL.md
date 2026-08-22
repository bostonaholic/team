---
name: solid-principles
description: SOLID object-oriented design principles methodology — loaded by implementer agent when writing code and by code-reviewer agent when checking for design violations
user-invocable: false
---

# SOLID Principles

Apply when writing new code; check for violations when reviewing. Each
principle below carries the smells that betray it in a diff.

## S — Single Responsibility

**One reason to change** — one actor or stakeholder whose requirements could
change the code.

Smells: a unit with more than one clear purpose (`UserService` that validates,
persists, *and* sends email); `and` in a name (`validateAndSave()`); functions
past ~30 lines; multiple unrelated tests for one unit.

If you cannot name a function without "and", it has too many jobs.

## O — Open/Closed

**Open for extension, closed for modification.** Adding behavior should not
require changing existing tested code.

Smells: a `switch`/`if-else` chain on a type field that must be edited for
every new type; hardcoded variant lists; tests that break whenever a new
variant is added.

Fix by defining an interface for the varying behavior and adding
implementations rather than branches.

## L — Liskov Substitution

**Subtypes are substitutable for their base types** without the caller
knowing which it got.

Smells: an override that throws `NotImplementedError` or does nothing;
callers checking `instanceof` before calling; subclasses weakening
preconditions or strengthening postconditions; tests that cannot run against
both base and subtype.

Design hierarchies on behavior, not taxonomy. Prefer composition when "is-a"
does not hold behaviorally. A subtype may restrict behavior (`ReadOnlyList`)
but must fulfill every contract the base advertises.

## I — Interface Segregation

**No client depends on methods it does not call.**

Smells: a 10-method interface whose implementers each use three; implementing
by throwing `UnsupportedOperationException`; test doubles that must stub many
irrelevant methods.

Split large interfaces; compose small ones when a concrete type needs several
contracts.

## D — Dependency Inversion

**High-level modules and low-level modules both depend on abstractions.**
Business logic does not import database drivers, HTTP clients, or filesystem
APIs directly.

Smells: domain classes that `new` their own dependencies; an infrastructure
import inside a domain service; tests that cannot run without a real database
or network. Two smells are easy to miss because the dependency is invisible in
the signature:

- **Static calls into infrastructure** (`Database.query(...)`, `Clock.now()`,
  `Config.get(...)`) have no seam, so tests cannot substitute them.
- **Singletons fetched inside business code** (`Registry.getInstance()`) make
  the class lie about what it needs.

Construct with collaborators, call with work — per
`skills/principle-construct-with-collaborators/SKILL.md`.

## In the reviewer role

Flag each violation by principle name, cite the file and line, and state the
consequence — why this violation matters for this codebase right now:

> `issue: SRP violation — this function handles both input validation and the
> database write.`

A finding that names no principle and no consequence is not actionable.
