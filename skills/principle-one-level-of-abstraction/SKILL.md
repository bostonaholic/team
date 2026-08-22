---
name: principle-one-level-of-abstraction
description: A function calls functions exactly one level below its own — pointed to by engineering-standards and refactoring-to-patterns when a body mixes orchestration with primitives.
user-invocable: false
---

# Call One Level Below

A principle, not a gate. A function calls functions exactly one level of
abstraction below its own, never two or more at once. A body that alternates
between high-level orchestration ("save the order, charge the card, send the
receipt") and low-level primitives ("pad the price to a fixed-width column")
makes the reader swap mental contexts line by line. Extract the low-level work
into a helper named at the surrounding level, and the body reads as the story
it is telling.

## What it rules out

- **A function that both orchestrates and manipulates bytes**, characters, or
  indices in the same body.
- **A helper named for its mechanism rather than for the level that calls
  it.** `padTo(width)` beside `chargeCard()` restates the mixing under a new
  name; `formatPriceColumn()` resolves it.
- **Domain vocabulary interrupted by machinery** — a loop index, a buffer
  offset, or a regex sitting between two business steps.
- **An extraction that only moves lines.** Splitting a body into `partOne` and
  `partTwo` keeps the same levels tangled and adds a jump.

## Boundary

- It governs the levels a body mixes, not its length. A long function whose
  every call sits at one level is not a violation of this rule;
  `refactoring-to-patterns` catalogs Long Method separately.
- Extraction costs a name and an indirection. Where a low-level fragment
  appears once and reads plainly, `principle-rule-of-three` governs whether to
  extract at all.
- The outermost layer has no level below it to call. A script, a main
  function, or an I/O shell may touch primitives directly.

## Where it applies

- `skills/engineering-standards/SKILL.md`
- `skills/refactoring-to-patterns/SKILL.md`
