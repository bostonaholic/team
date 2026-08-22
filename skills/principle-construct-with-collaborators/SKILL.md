---
name: principle-construct-with-collaborators
description: Constructors take collaborators; methods take per-call work — pointed to by solid-principles, engineering-standards, and refactoring-to-patterns when reviewing a constructor.
user-invocable: false
---

# Construct With Collaborators, Call With Work

A principle, not a gate. The constructor takes the long-lived collaborators
that define what the object IS — its clients, loggers, clock, database
handle — and does nothing else with them: it assigns and returns. Methods take
the per-call work parameters. Splitting identity from work is what leaves a
seam, so production wires real collaborators and a test substitutes fakes at
construction.

## What it rules out

- **Work parameters in the constructor.**
  `ReportGenerator(reportingDb, clock, startDate, endDate)` needs a new
  instance per query and conflates identity with work.
  `ReportGenerator(reportingDb, clock)` serves many date ranges through
  `generate(startDate, endDate)`.
- **A constructor that does work** — I/O, static lookups, or expensive
  computation performed before the object exists.
- **A dependency instantiated inside the method that uses it**, such as
  `new HttpClient()` inside `fetchUser()`. The dependency is invisible in the
  signature, and a test has nothing to substitute.
- **Infrastructure reached through a static call or a singleton** —
  `Database.query(...)`, `Clock.now()`, `Registry.getInstance()`. The same
  missing seam, arrived at a different way.

## Boundary

- It governs where a dependency enters, not how many enter. A constructor
  taking eight collaborators is a single-responsibility problem, and
  `solid-principles` owns that reading.
- It governs the shape of the wiring, not the type of the collaborator.
  Whether a parameter should be an interface or a concrete class is dependency
  inversion, also in `solid-principles`.
- A framework that constructs objects for you — a DI container, an ORM
  entity — still hands collaborators in. The principle constrains the
  signature you write, not a caller you do not control.

## Where it applies

- `skills/solid-principles/SKILL.md`
- `skills/engineering-standards/SKILL.md`
- `skills/refactoring-to-patterns/SKILL.md`
