---
name: refactoring-to-patterns
description: Fowler's refactoring methodology — loaded by the implementer agent when working with existing code to recognize code smells and apply proven transformations
user-invocable: false
---

# Refactoring to Patterns

Change internal structure without changing observable behavior. Every step
leaves all tests passing. **Never refactor while also adding features** —
separate the two activities into separate commits.

## When to refactor

- **Before making a change that the current structure makes hard.** Two small
  moves beat one large dangerous move.
- **On the third duplication.** Rule of Three: tolerate it the second time.
- **Before debugging code you cannot understand.** Clarify, then fix.

Do **not** refactor when tests are failing (fix them first), when the code
works and no change is imminent, or when a deadline is live — note the smell
and move on.

## Smell → refactoring

| Smell | Reach for |
|-------|-----------|
| Long Method | Extract Method; Replace Temp with Query; Decompose Conditional |
| Duplicate Code | Extract Method; Extract Class; Pull Up Method; Form Template Method |
| Large Class | Extract Class; Extract Subclass; Extract Interface |
| Long Parameter List | Introduce Parameter Object; Preserve Whole Object |
| Divergent Change (one class, several reasons to change) | Extract Class along each reason |
| Shotgun Surgery (one change, many classes) | Move Method / Move Field; Inline Class |
| Feature Envy (method more interested in another class's data) | Move Method |
| Primitive Obsession | Replace Data Value with Object; Replace Type Code with Class or Subclasses |
| Conditional Complexity | Replace Conditional with Polymorphism; Introduce Null Object; Decompose Conditional |
| Middle Man (half its methods just forward) | Remove Middle Man; Inline Method |

Two smells carry rules the catalog above does not make obvious:

**Mixed levels of abstraction.** A function that alternates between
high-level orchestration ("save the order, charge the card, send the
receipt") and low-level primitives ("format the price as fixed-width 8
chars") forces readers to swap mental contexts. Extract the low-level work
into a helper named at the surrounding level. **A function calls functions one
level of abstraction below its own — never two or more at once.**

**Constructor doing work.** Any of three shapes: instantiating dependencies
inside methods (`new HttpClient()` inside `fetchUser()`), taking per-call work
parameters in the constructor (`new ReportGenerator(2024, 1, 1, 2024, 12,
31)`), or doing I/O and static lookups in the constructor. All three leave no
seam for tests to substitute collaborators. The fix is one rule, stated in
full in `skills/principle-construct-with-collaborators/SKILL.md`.

## Safe refactoring procedure

1. **Confirm tests pass** before starting. Failing tests stop the refactor.
2. **Make the smallest possible structural change.** One refactoring at a time.
3. **Run tests after each change.** On a break, undo immediately — never
   proceed with broken tests.
4. **Commit when tests pass.** Each passing checkpoint is a safe point.
5. **Repeat** until the code is in the desired shape.

## In the implementer role

- **Read the code before changing it.** Identify smells before writing.
- **Refactor in its own commit, first** — then add the feature.
- **Refactor only what you touch.** Opportunistic refactoring of distant code
  is scope creep.
- **Name the smell and the refactoring in the commit.**
  `refactor: extract user validation into UserValidator (Long Method)`.
- **When in doubt, leave it.** A refactoring that breaks tests is worse than
  the smell it was trying to fix.
