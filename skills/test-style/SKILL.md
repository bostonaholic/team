---
name: test-style
description: 'Defines deterministic behavioral tests and flaky-test red flags. Load when writing or reviewing `.test.ts` and `.evals.ts` files.'
user-invocable: false
---

# Test Style Rules

Before writing or reviewing tests, read [references/test-style-manual.md](references/test-style-manual.md).
It owns examples, language tools, the full audit bar, and every exception.

## Core rules

- Test observable behavior, not private calls. Interaction tests cover state changes only.
- Keep tests DAMP: linear arrange-act-assert, inputs visible, no test-body logic.
- Assert only the field or effect under test. Make failures actionable from name and output.
- Wait for conditions; never use fixed sleeps. Await every task; allow valid interleavings.
- Prefer real, then fake, then mock. Wrap vendor types behind owned interfaces.
- Reserve E2E for critical user journeys. Add cross-feature tests where behavior overlaps.

## Assert outcomes, not interleavings

Never depend on scheduler order. Use joins, awaits, barriers, or latches. Sort
or compare sets unless order is the contract.

## Control the clock

Freeze or inject time. Never feed real `new Date()`, `Date.now()`, naive calendar
math, future expiry literals, or timezone-naive dates into assertions.

```js
const token = { expiresAt: "2030-01-01" };
expect(isValid(token, new Date())).toBe(true);
```

```js
const now = new Date("2024-06-15T12:00:00Z");
const token = issueToken({ now, ttlDays: 30 });
expect(isValid(token, now)).toBe(true);
```

## Seed all randomness

Use explicit inputs or seed every RNG that can affect an assertion.

## Tests own their state — any order, any host

Each test creates and removes its DB rows, files, cache values, and environment
changes. Reset shared state. Never depend on another test or execution order.

## Impose order before asserting it

Use `ORDER BY` or sort before positional assertions. Otherwise use unordered
matchers. Never compare ordered expectations with set-backed results.

## Hermetic boundaries

Stub real networks; allocate ports dynamically; always close resources. Pin
locale, timezone, paths, and line endings. Compare floats with tolerance.

## Audit checklist

| Check | Pass criterion |
|---|---|
| Behavior-named | Name behavior, not a method. |
| Narrow assertion | Assert the specific contract. |
| Actionable failure | Output names the failed condition. |
| No sleeps | Use condition waits. |
| Deterministic inputs | Freeze clocks, seed RNGs, own state, order results, stub networks, allocate ports, close resources, pin environment, tolerate floats. |
| No test logic | No branches, loops, or string building. |
| One scenario per test | One independent behavior. |
| DAMP setup | Keep assertion-relevant setup visible. |
| Fidelity ladder | Real > fake > mock; wrap unowned types. |

## Flaky-test red flags (reviewer checklist)

Any outcome-dependent flag is blocking on first occurrence per `skills/reviewing-code/SKILL.md`:
real time or future dates; `sleep()` or timed waits; race order or missing awaits;
shared state or missing teardown; unseeded randomness; real networks; leaked resources or fixed ports; unordered positions; exact floats; platform, locale,
TZ, CPU, or CI parallelism. Fixed explicit-TZ dates and deterministic controls do not flag.
