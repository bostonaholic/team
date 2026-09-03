---
name: test-style
description: Write or audit deterministic, behavior-focused tests using Team's test-quality and flaky-test rules.
user-invocable: false
---

# Test Style Rules

These rules govern acceptance tests written under
`skills/test-first-development/SKILL.md` and every changed test under review.

## Input

Apply to every acceptance test and every changed test file.

## Test behavior, not implementation

Assert caller-visible returns, persisted state, or effects. Assert private
calls or order only when that interaction is itself externally observable.
Interaction tests cover state changes, not queries.

## Tests are DAMP, not DRY

Keep arrange-act-assert linear and visible. Helpers must accept every
assertion-relevant value. Put no branches, loops, or string-building in a test.

## Narrow assertions

Assert the specific field or effect. Use subset/unordered matchers. Reserve a
full snapshot for one representative default case.

## Test failures must be actionable

Names describe behavior. Assertions print actual and expected values; prefer
`EXPECT_OK(value)` or equality over a bare predicate.

## Wait for the condition. Never sleep

Replace fixed `sleep(N)` with a bounded wait for an observable condition.

## Assert outcomes, not interleavings

Join/await every task. Accept every valid completion order or impose order
with a latch/barrier. Assert sets or sorted results, not scheduler order.

## Control the clock

Inject or freeze time. Never feed wall time, a hard-coded future expiry,
naive calendar arithmetic, or a timezone-naive date into an assertion.
Fixed past dates with explicit timezones are allowed.

**Bad:**
```js
// Bad — wall-clock read feeds the assertion; hard-coded future expiry.
const token = { expiresAt: "2030-01-01" };
expect(isValid(token, new Date())).toBe(true);
```

**Good:**
```js
// Good — frozen clock; expiry derived from it.
const now = new Date("2024-06-15T12:00:00Z");
const token = issueToken({ now, ttlDays: 30 });
expect(isValid(token, now)).toBe(true);
```

## Seed all randomness

Use fixed values when possible. Otherwise seed every RNG that affects an
assertion; bare `Math.random()`, `uuid.v4()`, or unseeded Faker flags.

## Tests own their state — any order, any host

Create every prerequisite and tear down every DB row, file, cache, env value,
singleton, or connection. Never depend on another test or execution order.

## Impose order before asserting it

Sort or use `ORDER BY` before positional assertions. Otherwise assert
membership without order.

## Hermetic boundaries

Stub network boundaries and inject clients. Allocate dynamic ports. Guarantee
resource teardown. Pin locale/TZ/platform formatting, use portable paths and
line endings, and compare floats with a tolerance.

## Fidelity ladder: real > fake > mock

Prefer production implementations, then owner-maintained in-memory fakes.
Use mocks only for unavailable collaborators or injected error paths. Wrap
vendor types behind owned interfaces before mocking.

## Do not mock types you do not own

Mock the owned wrapper, not the vendor API.

## E2E reserved for critical user journeys

Keep E2E coverage to critical goal-plus-task workflows.

## Test workflows, not just features

When new behavior overlaps existing behavior, include a cross-feature
acceptance test.

## Audit checklist

| Check | Pass criterion |
|---|---|
| Behavior-named | Name states observable behavior |
| Narrow assertion | Assertion targets the contract field/effect |
| Actionable failure | Output identifies actual and expected state |
| No sleeps | Synchronization waits for a condition |
| Deterministic inputs | Clock, randomness, order, state, network, ports, floats, locale, and platform are controlled |
| No test logic | No branches, loops, or string construction |
| One scenario per test | Independent single behavior |
| DAMP setup | Relevant values stay visible |
| Fidelity ladder | Real > fake > mock; mock only owned interfaces |

Report each failure by checklist name.

## Flaky-test red flags (reviewer checklist)

The severity rule lives in `skills/reviewing-code/SKILL.md`. Flag the first
occurrence when a test's *outcome depends on*:

- **Time/date:** wall clock, future literals, calendar/DST assumptions, or
  timezone-naive dates.
- **Fixed/timed waits:** `sleep()`, timer-based UI waits, or a bounded wait
  whose timing determines success.
- **Concurrency:** assumed completion order, shared unsynchronized state, or
  missing join/await.
- **Test order/shared state:** cross-test state or missing teardown.
- **Unseeded randomness.**
- **Real network/external services.**
- **Resource leaks or hard-coded ports.**
- **Unordered collection position.**
- **Exact float equality.**
- **Platform/environment:** path, line-ending, locale, TZ, CPU, or CI-worker
  assumptions.

## Done

Every checklist row passes and no uncontrolled input determines the outcome.
