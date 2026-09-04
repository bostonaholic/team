---
name: refactoring-to-patterns
description: 'Maps code smells to behavior-preserving refactorings. Load before refactoring code or preparing it for an imminent change.'
user-invocable: false
---

# Refactoring to Patterns

Change internal structure without changing observable behavior. Every step keeps tests green. Never combine refactoring and feature work in one commit.

## When to refactor

Refactor before an imminent change that current structure obstructs, on the third duplication (Rule of Three tolerates the second), or before debugging unreadable code. Do not refactor while tests fail, without an imminent need, or under a live deadline; record the smell and continue.

## Smell → refactoring

| Smell | Reach for |
|---|---|
| Long Method | Extract Method; Replace Temp with Query; Decompose Conditional |
| Duplicate Code | Extract Method; Extract Class; Pull Up Method; Form Template Method |
| Large Class | Extract Class; Extract Subclass; Extract Interface |
| Long Parameter List | Introduce Parameter Object; Preserve Whole Object |
| Divergent Change | Extract Class along each reason |
| Shotgun Surgery | Move Method / Move Field; Inline Class |
| Feature Envy | Move Method |
| Primitive Obsession | Replace Data Value with Object; Replace Type Code with Class or Subclasses |
| Conditional Complexity | Replace Conditional with Polymorphism; Introduce Null Object; Decompose Conditional |
| Middle Man | Remove Middle Man; Inline Method |

**Mixed abstraction levels:** a function calls functions one level below its own, never two or more. Extract low-level byte/format work from high-level orchestration behind a name at the caller's level.

**Constructor doing work:** construct with long-lived collaborators (HTTP client, DB, clock, logger); call methods with per-call work (date ranges, query strings, request bodies). Never instantiate collaborators inside work methods, pass work into constructors, or perform I/O/static lookup there. Constructors assign and return; tests inject fakes.
`new HttpClient()` inside `fetchUser()` is forbidden per-call construction.

## Safe refactoring procedure

1. Confirm tests pass; otherwise stop.
2. Make one smallest structural change.
3. Run tests; undo immediately on failure.
4. Commit the passing checkpoint.
5. Repeat to the required structure.

## In the implementer role

Read before editing. Refactor first in its own commit, then add the feature. Touch only code required by current scope. Name the smell/refactoring in the commit, e.g. `refactor: extract user validation into UserValidator (Long Method)`. When uncertain, leave it.
