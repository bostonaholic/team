---
name: refactoring-to-patterns
description: Apply Fowler refactorings only where planned work is blocked by existing structure.
user-invocable: false
---

# Refactoring to Patterns

## Input

Use only when tests pass and a planned change touches code whose structure
impedes that change. Do not refactor unrelated code or mix refactoring with a
feature or bug-fix commit.

## Choose the refactoring

| Smell | Refactoring |
|---|---|
| Long method | Extract Method; Decompose Conditional |
| Duplicate code (third occurrence) | Extract Method/Class; Form Template Method |
| Large class / divergent change | Extract Class/Interface along each reason |
| Long parameter list / primitive obsession | Introduce Parameter Object or value type |
| Shotgun surgery / feature envy | Move Method/Field; Inline Class |
| Type-condition chain | Replace Conditional with Polymorphism |
| Middle man | Remove Middle Man; Inline Method |

Two additional rules:

- A function calls one abstraction level below itself. Extract lower-level work.
- Construct with long-lived collaborators; pass per-call work to methods.
  Constructors assign dependencies and perform no I/O, lookup, or computation.

## Required sequence

1. Confirm the relevant suite passes.
2. Make one structural change.
3. Run tests; undo immediately on failure.
4. Commit the passing refactor separately, naming the smell and transformation.
5. Repeat only as needed for the planned change.

## Done

Observable behavior is unchanged, tests pass at every checkpoint, and the
feature or fix remains a separate commit.
