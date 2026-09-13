# Test quality policy

These rules govern every acceptance test and are the bar reviewers hold changed test files to. Each rule catches a different class of test-suite decay.

## Test behavior, not implementation

Tests assert externally observable outcomes — return values, persisted state, effects visible to other components. A refactor that preserves behavior must leave every acceptance test green. Interaction tests verify state-changing calls only; never assert on query-only calls.

## Tests are DAMP, not DRY

Inline the setup a reader needs to understand a failing test. Tolerate duplication; favor a linear arrange-act-assert story. Pass the asserted value through helpers, never hide it. No `if`, no loops, no string-building inside a test body.

## Narrow assertions

Assert the specific field or effect the test cares about, not full equality on a complex object. Reserve full-snapshot assertions for at most one default test per common case.

## Test failures must be actionable

A failing test must be diagnosable from name + assertion output alone, without rerunning. Test names describe behavior, not method.

## Wait for the condition. Never sleep

Replace every fixed `sleep(N)` with a wait-for-condition primitive.

## Assert outcomes, not interleavings

Never depend on scheduler order. `join()`/`await` every concurrent task before asserting. Sort or compare sets unless order is the contract.

## Control the clock

Freeze or inject time. Never feed real `new Date()`, `Date.now()`, naive calendar math, future expiry literals, or timezone-naive dates into assertions.

```js
const token = { expiresAt: "2030-01-01" };
expect(isValid(token, new Date())).toBe(true);
```

```js
const now = new Date("2024-06-15T12:00:00Z");
const token = issueToken({ now, ttlDays: 30 });
expect(isValid(token, now)).toBe(true);
```

Past or fixed date literals with an explicit timezone are the sanctioned form.

## Seed all randomness

Use explicit inputs or seed every RNG that can affect an assertion.

## Tests own their state — any order, any host

Each test creates and removes its DB rows, files, cache values, and environment changes. Reset shared state. Never depend on another test or execution order.

## Impose order before asserting it

Use `ORDER BY` or sort before positional assertions. Otherwise use unordered matchers. Never compare ordered expectations with set-backed results.

## Hermetic boundaries

Stub real networks; allocate ports dynamically; always close resources. Pin locale, timezone, paths, and line endings. Compare floats with tolerance.

## Fidelity ladder: real > fake > mock

Prefer real, then fake, then mock. Wrap vendor types behind owned interfaces. E2E is reserved for critical user journeys; when behavior overlaps an existing feature, add a cross-feature interaction test.

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

Any outcome-dependent flag is blocking on first occurrence per the [code reviewer brief](../code-review/references/code-reviewer.md): real time or future dates; `sleep()` or timed waits; race order or missing awaits; shared state or missing teardown; unseeded randomness; real networks; leaked resources or fixed ports; unordered positions; exact floats; platform, locale, TZ, CPU, or CI parallelism. Fixed explicit-TZ dates and deterministic controls do not flag.
