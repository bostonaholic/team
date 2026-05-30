---
agent: implementer
tier: periodic
deps:
  - agents/implementer.md
---

# Implement slice: sum reducer

You are the implementer. A git-repo workspace has been initialized for you in
the working directory. It contains a FROZEN plan and structure plus a single
planted acceptance test that currently FAILS.

## Frozen structure (excerpt)

Slice 1 (only slice): implement `sum(numbers)` in `src/sum.js` that returns the
arithmetic sum of an array of numbers, returning 0 for an empty array.

## Frozen plan (excerpt)

1. Create `src/sum.js` exporting a single function `sum(numbers)`.
2. `sum([])` returns `0`; `sum([1, 2, 3])` returns `6`.

## Acceptance test (already written, currently failing)

`test/acceptance.js` asserts `sum([1, 2, 3]) === 6` and `sum([]) === 0`. Make
the acceptance test pass with the minimal implementation. Do NOT modify the
test.
