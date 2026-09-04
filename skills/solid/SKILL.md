---
name: solid
description: 'Defines SOLID design and review rules. Load when writing or reviewing object-oriented production code.'
user-invocable: false
---

# SOLID Principles

Apply when writing new code and reviewing diffs.

## S — Single Responsibility

**One reason to change:** one actor or stakeholder. Smells: multiple purposes;
`and` in `validateAndSave()`; functions past ~30 lines; unrelated tests for one unit.

If you cannot name a function without "and", it has too many jobs.

## O — Open/Closed

**Open for extension, closed for modification.** Smells: `switch`/`if-else` on
types, hardcoded variants, or tests broken by a new variant. Define an interface
for varying behavior; add implementations instead of branches.

## L — Liskov Substitution

**Subtypes substitute for base types.** Smells: `NotImplementedError`, no-op
overrides, caller `instanceof`, weaker preconditions, stronger postconditions,
or tests that cannot cover both. Model behavior, prefer composition when “is-a”
fails, and keep every advertised contract, including for `ReadOnlyList`.

## I — Interface Segregation

**No client depends on unused methods.** Smells: a 10-method interface whose
implementers use three, `UnsupportedOperationException`, or irrelevant stubs.
Split interfaces; compose small contracts.

## D — Dependency Inversion

**High- and low-level modules depend on abstractions.** Business logic never
imports database, HTTP, or filesystem APIs directly. Smells: constructing
dependencies, infrastructure imports, required real services, static
`Database.query(...)`/`Clock.now()`/`Config.get(...)`, or hidden
`Registry.getInstance()` singletons.

**Construct with collaborators. Call with work.** Inject long-lived clients,
loggers, clocks, and DB handles; pass per-call inputs to methods. Prefer
`ReportGenerator(reportingDb, clock).generate(startDate, endDate)` over putting
the date range in the constructor.
Reuse `ReportGenerator(reportingDb, clock)` across calls; constructing `ReportGenerator(reportingDb, clock, startDate, endDate)` per range is the smell.

## In the reviewer role

Name the principle, cite `file:line`, and state the current consequence:

> `issue: SRP violation — this function handles both input validation and the
> database write.`

A finding that names no principle and no consequence is not actionable.
