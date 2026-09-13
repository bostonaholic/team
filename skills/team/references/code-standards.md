# Code Standards

The design and implementation bar for planner, implementer, and code-reviewer.
Read this file before planning, implementing, or reviewing production code.

## Core Philosophy

- **Hickey:** simple immutable data and pure functions.
- **Carmack:** direct implementation with a way to measure performance.
- **Armstrong:** isolate failures so one module cannot propagate faults.
- **Knuth:** clarity before cleverness.
- **Liskov:** honor contracts; subtypes substitute for base types.
- **Ousterhout:** deep modules with simple interfaces; keep complexity inside.

Weigh benefit against maintenance, runtime, false-positive, and cognitive costs.
Apply Rule of Three: tolerate the second duplication; extract on the third.

## SOLID design principles

Apply when writing new code and reviewing diffs.

- **Single Responsibility** — one actor or stakeholder is the one reason to
  change. A function you cannot name without "and" has too many jobs.
- **Open/Closed** — open for extension, closed for modification. Define an
  interface for varying behavior; add implementations instead of branches.
- **Liskov Substitution** — subtypes substitute for base types. Keep every
  advertised contract; prefer composition when "is-a" fails.
- **Interface Segregation** — no client depends on unused methods. Split
  interfaces; compose small contracts.
- **Dependency Inversion** — high- and low-level modules depend on
  abstractions. Business logic never imports database, HTTP, or filesystem
  APIs directly.

## Code Comments

These rules govern source comments; review findings use the [finding
format](../code-review/references/findings.md). Comments never explain WHAT
code does. Permit only non-obvious WHY—constraints, workarounds, surprising
requirements—when names, structure, and tests cannot carry it.

- **Rewrite first.** Before adding a comment, try a named function or variable.
- **No ticket/issue IDs, plan/slice/phase markers, or doc-section references.** A public upstream-issue URL that is itself the why is allowed; internal trackers and pipeline artifacts are not.
- **No process narration.** State current code constraints. Never mention dates, corrections, edit history, users/prompts, review feedback, ticket discussion, or agent instructions. "Previously," "Originally," "As of," "Correction," "Temporary fix from," and "This was changed because" are detection hints, not the rule.
- **Document deliberate constraints.** Name the consequence of removing odd code: API limits, compatibility, security, performance, ordering, concurrency, or framework behavior.
- **Be local, concise, precise, verified.** Use symbols/stable identifiers, not line numbers or layout. Never say only "handle edge case."
- **Do not duplicate** types, tests, names, or public docs. Link an external spec only for a precise contract.
- **No commented-out code. No TODO/FIXME in delivered code.** Deferred work belongs in the implementer report.
- Remove obsolete comments in the same diff; preserve repo style.
- The why-only rule covers in-body comments. Doc comments on exported/public interfaces must add contract facts absent from the signature; restating a signature is a WHAT comment.

Decision test: Does this explain why? Can code/tests carry it? Is it true now without process context? Will it remain true as nearby code changes?

## Design-First Workflow

1. **Understand Requirements.** Enumerate boundary values (empty, zero, max), invalid inputs, timeouts/partial writes, concurrency, authorization, and resource limits.
2. **Design First.** Sketch interfaces, data structures, and module boundaries.
3. **Implement Incrementally.** Use small verified steps; commit working checkpoints.
4. **Self-Review.** Apply every Quality Checklist item to every touched file.
5. **Explain Decisions.** State decisions, trade-offs, and non-obvious choices.

## Quality Checklist

Every item gates progress: **Single Responsibility**; **Clear Naming**; **No Magic Numbers**; **Explicit Error Handling**; **Low Coupling**; **Testability**; **Readability** (new developer understands in 5 minutes); **DRY** under Rule of Three; **Performance Awareness**; **Functional Core, Imperative Shell**; **No Primitive Obsession** (Money, Duration, EmailAddress, OrderId instead of raw `string`/`int`); **Failures are actionable** (prefer `assert_eq(actual, expected)` over opaque `assert(predicate)`); **Comment Discipline**.

## When Implementing

- **Construct with collaborators, call with work.** Constructors take long-lived clock, DB, logger, or HTTP client dependencies; methods take per-request work. Constructors do no I/O, static lookup, or expensive work. Prefer `ReportGenerator(reportingDb, clock).generate(startDate, endDate)` over putting the date range in the constructor. Never instantiate collaborators inside work methods.
- Keep one abstraction level per function; extract lower-level work behind names at the caller's level. A function calls functions one level below its own, never two or more.
- Catch only the exact throwing call and specific exception; chain the original cause. Never wrap a large block in `catch (Exception e)`.
- Follow neighboring project style, naming, and patterns.
- Remove what the change replaces or leaves unused before adding its replacement; add no guard the spec does not demand ([focused work rules](principles/focused-work.md)).

## When Reviewing

- Apply every Quality Checklist item to every changed file and cite its name in findings, e.g. `issue: Clear Naming — the variable d does not reveal intent`.
- Check for Design-First evidence in interfaces and boundaries.
- Rank failure isolation (Armstrong) and interface contracts (Liskov) above formatting (Knuth).
- Name the SOLID principle, cite `file:line`, and state the current consequence. A finding that names no principle and no consequence is not actionable.
- Flag validators, guards, options, and parallel mechanisms that no design, plan, or test demands ([focused work rules](principles/focused-work.md)).

## When to refactor

Refactor before an imminent change that current structure obstructs, on the third duplication (Rule of Three tolerates the second), or before debugging unreadable code. Do not refactor while tests fail, without an imminent need, or under a live deadline; record the smell and continue.

Change internal structure without changing observable behavior. Every step keeps tests green. Never combine refactoring and feature work in one commit.

## Safe refactoring procedure

1. Confirm tests pass; otherwise stop.
2. Make one smallest structural change.
3. Run tests; undo immediately on failure.
4. Commit the passing checkpoint.
5. Repeat to the required structure.

Refactor first in its own commit, then add the feature. Touch only code required by current scope. Name the smell/refactoring in the commit, e.g. `refactor: extract user validation into UserValidator (Long Method)`. When uncertain, leave it.
