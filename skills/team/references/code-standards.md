# Code Standards

The design and implementation bar for planner, implementer, and design reviewer.
Read this file before planning, implementing, or reviewing production code.

## Core Philosophy

- **Hickey:** simple immutable data and pure functions.
- **Carmack:** direct implementation with a way to measure performance.
- **Armstrong:** isolate failures so one module cannot propagate faults.
- **Knuth:** clarity before cleverness.
- **Liskov:** honor contracts; subtypes substitute for base types.
- **Ousterhout:** deep modules with simple interfaces; keep complexity inside.

Weigh benefit against maintenance, runtime, false-positive, and cognitive costs.
Rule of Three: tolerate the second duplication; extract on the third.

## SOLID design principles

**Single Responsibility**, **Open/Closed**, **Liskov Substitution**,
**Interface Segregation**, and **Dependency Inversion** (business logic never
imports database, HTTP, or filesystem APIs directly).

## Code Comments

These rules govern source comments. Comments never explain WHAT code does.
Permit only non-obvious WHY (constraints, workarounds, surprising
requirements) when names, structure, and tests cannot carry it.

- Try a named function or variable before adding a comment.
- No ticket/issue IDs, plan/slice/phase markers, or doc-section references. A public upstream-issue URL that is itself the why is allowed; internal trackers and pipeline artifacts are not.
- No process narration: dates, corrections, edit history, users/prompts, review feedback, ticket discussion, or agent instructions ("Previously," "Originally," "As of," "Correction" are detection hints, not the rule).
- For deliberate odd code, name the consequence of removing it (API limits, compatibility, security, performance, ordering, concurrency, framework behavior).
- Use symbols/stable identifiers, not line numbers or layout. Never say only "handle edge case." Do not duplicate types, tests, names, or public docs; link an external spec only for a precise contract.
- No commented-out code. No TODO/FIXME in delivered code; deferred work belongs in the implementer report.
- Remove obsolete comments in the same diff; preserve repo style.
- Doc comments on exported/public interfaces must add contract facts absent from the signature.

Keep a comment only if it explains why, code/tests cannot carry it, and it stays true without process context as nearby code changes.

## Design-First Workflow

1. Enumerate boundary values (empty, zero, max), invalid inputs, timeouts/partial writes, concurrency, authorization, and resource limits.
2. Sketch interfaces, data structures, and module boundaries.
3. Implement in small verified steps; commit working checkpoints.
4. Apply the Quality Checklist to every touched file.
5. State decisions, trade-offs, and non-obvious choices.

## Type contracts

Types match runtime behavior. Validate untrusted values at the boundary that owns them, then rely on that guarantee. Avoid unchecked conversions, forced assertions, and optionals that conceal a required input.

## Quality Checklist

Every item gates progress: **Single Responsibility**; **Clear Naming**; **No Magic Numbers**; **Explicit Error Handling**; **Low Coupling**; **Testability**; **Readability** (new developer understands in 5 minutes); **DRY** under Rule of Three; **Performance Awareness**; **Functional Core, Imperative Shell**; **No Primitive Obsession** (domain types such as Money or OrderId, not raw `string`/`int`); **Failures are actionable** (`assert_eq(actual, expected)` over `assert(predicate)`); **Comment Discipline**.

## When Implementing

- **Construct with collaborators, call with work.** Constructors take long-lived dependencies (clock, DB, logger, HTTP client) and do no I/O, static lookup, or expensive work; methods take per-request work. Never instantiate collaborators inside work methods.
- A function calls functions one abstraction level below its own, never two or more.
- Catch only the exact throwing call and specific exception; chain the original cause.
- Follow neighboring project style, naming, and patterns.
- Remove what the change replaces or leaves unused before adding its replacement; add no guard the spec does not demand ([focused work rules](principles/focused-work.md)).

## When Reviewing

- Apply the Quality Checklist to every changed file and cite the item name in findings, e.g. `issue: Clear Naming — the variable d does not reveal intent`.
- Check for Design-First evidence in interfaces and boundaries.
- Rank failure isolation (Armstrong) and interface contracts (Liskov) above formatting (Knuth).
- Name the principle, cite `file:line`, and state the current consequence; a finding with neither principle nor consequence is not actionable.
- Flag validators, guards, options, and parallel mechanisms that no design, plan, or test demands ([focused work rules](principles/focused-work.md)).

## When to refactor

Refactor before an imminent change that current structure obstructs, on the third duplication, or before debugging unreadable code. Do not refactor while tests fail, without an imminent need, or under a live deadline; record the smell and continue.

## Safe refactoring procedure

Confirm tests pass (otherwise stop), make the smallest structural change, run tests (undo on failure), commit the passing checkpoint, and repeat. Refactor first in its own commit, then add the feature; never combine them in one commit. Touch only code required by current scope. Name the smell in the commit, e.g. `refactor: extract user validation into UserValidator (Long Method)`. When uncertain, leave it.
