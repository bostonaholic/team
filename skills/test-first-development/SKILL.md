---
name: test-first-development
description: Acceptance tests as immutable scope fence — loaded by test-architect and orchestrator to enforce test-before-implementation discipline and completion contracts
user-invocable: false
---

# Test-First Development

Acceptance tests define the scope fence. They are written before implementation
begins and remain immutable throughout. Implementation is complete when — and
only when — all acceptance tests pass.

## Core Rule

Write ALL acceptance tests from the plan BEFORE any implementation code.

This is non-negotiable. Tests are the contract between the plan and the code.
They answer two questions with certainty:

1. **Is implementation done?** All tests pass = done. Any test fails = not done.
2. **Did scope creep?** If work happens that no test covers, it is unplanned work.

## Process

> Follow `skills/progress-tracking/SKILL.md`: when this procedure has two or more steps, seed one todo item per step before starting and mark each complete as you go.

### 1. Write Every Test From the Plan

The plan's Tests section enumerates every acceptance test by name and
description. Write all of them. Use the exact names from the plan. Do not add
tests. Do not omit tests. Do not rename tests.

**Edge cases are part of the contract.** The test list is expected to
include boundary values, invalid inputs, failure paths, concurrency,
auth, and resource-limit scenarios identified during design. If the test
list reads as happy-path only, that is a plan defect — return to the
PLAN phase rather than silently filling the gap during implementation.

### 2. Confirm Tests Fail Correctly

Run the full test suite after writing all acceptance tests. Every new test must:

- **FAIL** — with an assertion failure, because the implementation does not
  exist yet
- **Not ERROR** — the test infrastructure must be sound (imports resolve,
  fixtures load, test runner executes the test)

A test that errors is not a failing test — it is a broken test. The
distinction matters.

### 3. Fix Errors, Not Failures

When a test errors instead of fails:

- **Missing imports:** Create placeholder module files with empty exports
- **Missing fixtures:** Create minimal fixture data
- **Missing types:** Add type stubs or interfaces
- **Configuration issues:** Fix test runner configuration

These stubs exist solely to make the test runner execute the test. They must be
obviously incomplete — empty functions that return nothing, interfaces with no
implementation.

Never write implementation code to fix a test error. If the test needs real
implementation to even run, the test is testing at the wrong level of
abstraction.

### 4. Lock the Test List

Once all tests fail correctly, the test list is IMMUTABLE for the duration of
implementation. This means:

- **No adding tests** — new tests expand scope beyond the plan
- **No removing tests** — removed tests shrink the completion contract
- **No modifying assertions** — changed assertions move the goalposts
- **No renaming tests** — renamed tests break traceability to the plan

If the test list needs to change, that is a plan change. Return to the PLAN
phase, update the plan, and get re-approval.

## Two Levels of Testing

### Feature-Level Acceptance Tests (Scope Fence)

These are the tests written in the TEST-FIRST phase. They verify the feature's
external behavior as described in the plan. They are coarse-grained, testing
observable outcomes rather than internal mechanics.

The acceptance test list is immutable during implementation.

### Step-Level TDD (Red-Green-Refactor)

During IMPLEMENT, the developer may use traditional TDD cycles to build up
the implementation:

1. **Red** — Write a small unit test for the next piece of internal logic
2. **Green** — Write the minimum code to make it pass
3. **Refactor** — Clean up without changing behavior

These step-level tests are implementation details. They can be freely added,
modified, or removed during implementation. They are not part of the scope
fence.

The distinction: acceptance tests define **what** must work. Step-level TDD
helps build **how** it works.

## Test Style Rules

These rules govern every acceptance test written under this skill. Each rule
catches a different class of test-suite decay.

### Test behavior, not implementation

Tests assert externally observable outcomes. A refactor that preserves
behavior must leave every acceptance test green. Tests that break on
internal restructuring are change-detectors — they produce noise on every
refactor without proving the system works.

- Assert on what the caller observes: return values, persisted state, effects
  visible to other components.
- Do not assert on which private methods were called in which order, unless
  the call itself is the observable behavior (e.g., publishing a message to
  an external channel).
- Interaction tests verify state-changing calls only; never assert on
  query-only calls.

### Tests are DAMP, not DRY

Test code is read far more than it is run. Inline the setup a reader needs to
understand a failing test. Tolerate duplication; favor a linear
arrange-act-assert story.

- Pass the asserted value through helpers: `create_account(BALANCE)`, not
  `create_account()` that hides the value the assertion checks.
- No `if`, no loops, no string-building inside a test body — they can carry
  the same bug as the code under test.
- Extract helpers only when the same setup appears across many tests AND the
  helper does not hide assertion-relevant inputs.

### Narrow assertions

Assert on the specific field the test cares about (`account.balance == 2000`),
not full equality on a complex object. Reserve full-snapshot assertions for
at most one default test per common case.

Use subset matchers when available (`comparingExpectedFieldsOnly`,
`UnorderedElementsAre`, `protocmp.FilterField`). Brittle failures are a
signal that the test toolkit is missing a matcher — propose one rather than
blaming the test author.

### Test failures must be actionable

A failing test must be diagnosable from name + assertion output alone,
without rerunning.

- `EXPECT_OK(loadMetadata())` beats `EXPECT_TRUE(loadMetadata().ok())`
  because the failure prints the actual error.
- `assertEqual(actual, expected)` beats `assert(predicate)` because it prints
  both values.
- Test names describe behavior, not method: `sendsEmailWhenBalanceIsLow`, not
  `testProcessTransaction_1`.

### Wait for the condition; never sleep

Replace every fixed `sleep(N)` with a wait-for-condition primitive (exist,
not-exist, wait-to-exist with timeout + interval). A fixed sleep both masks
race-condition bugs and pads runtime when the system is fast.

### Assert outcomes, not interleavings

A test whose result depends on thread or promise scheduling passes only
when the scheduler cooperates. Accept every valid interleaving, or make
the interleaving deterministic.

- `join()`/`await` every concurrent task before asserting — never assert
  mid-flight.
- Assert order-independent properties on concurrently produced results —
  set membership or a sorted comparison, not `results[0] === "A"`.
- Where ordering genuinely matters, impose it with latches/barriers
  (`CountDownLatch`, chained promises) instead of relying on scheduler
  luck.

### Control the clock

Never read the real wall clock in a test — inject or freeze it
(`vi.setSystemTime`, fake timers, `Clock.fixed`, `freezegun`). Each
sub-pattern below ships a time-bomb: a test that is green today and
permanently red on some future date.

- No assertion against "now": `new Date()`, `Date.now()`, `datetime.now()`
  feeding an assertion.
- No hard-coded future expiry: `expiresAt: "2030-01-01"`, cert `notAfter` —
  generate expiring artifacts at setup, relative to the frozen clock.
- No naive calendar arithmetic on "now": `addMonths` / `+1 day` assumes
  month lengths, 24-hour days, and no DST; it fails on month-end, leap
  day, and DST-transition days.
- No TZ-naive date construction: `new Date("2023-08-31")` parses as UTC
  midnight and shifts a day in negative-offset zones.

Past or fixed date literals with an explicit timezone are the sanctioned
form.

**Bad:**
```js
// Bad — wall-clock read feeds the assertion; hard-coded future expiry.
// Green today, permanently red once the clock crosses the literal.
const token = { expiresAt: "2030-01-01" };
expect(isValid(token, new Date())).toBe(true);
```

**Good:**
```js
// Good — frozen/injected clock; expiry derived from it.
const now = new Date("2024-06-15T12:00:00Z");
const token = issueToken({ now, ttlDays: 30 });
expect(isValid(token, now)).toBe(true);
```

### Seed all randomness

An unseeded RNG feeding an assertion is a defect, not a convenience —
generated data can collide with the asserted value.

- Seed every generator the test touches: `faker.seed(12345)`, a seeded
  `Random(seed)` — never bare `Math.random()` or `uuid.v4()` in asserted
  data.
- Better: explicit fixed inputs. `createUser({ name: "Bob" })` cannot
  collide; `createUser({ name: faker.person.firstName() })` can.

### Tests own their state — any order, any host

A test builds its own preconditions and tears down what it creates. A test
that passes only in a specific order, or only after another test has run,
is order-dependent — a leading flakiness cause.

- No static or module-level mutable state shared across tests; reset
  singletons and caches in `beforeEach`/`afterEach`.
- Every DB row, file, cache entry, or env var a test creates gets a
  teardown (prefer transaction rollback).
- Never assert on state a different test produced. The suite must pass in
  any order and on any host.

### Impose order before asserting it

Hash map/set iteration, `os.listdir`, and queries without `ORDER BY` have
no defined order — a positional assertion on them is platform-dependent
luck.

- Add an explicit `ORDER BY` / `.order_by()` / sort before any positional
  assertion (`results[0]`).
- Or assert order-independently: set membership, unordered-elements
  matchers.
- Never compare an ordered structure against a set-backed result.

### Hermetic boundaries

The test must not depend on anything outside the process it controls.

- No real network or external services — stub the boundary (`nock`,
  `WireMock`, `msw`) and inject the client.
- No hard-coded ports for embedded servers/DBs — dynamic allocation
  (port `0`, TestContainers) plus guaranteed teardown; fixed ports collide
  under parallel CI.
- Guarantee teardown of every opened connection, file, or socket
  (`try/finally`, `using`, `defer`, or the framework's fixture teardown) —
  a leaked handle can fail a later test.
- No locale/platform-format assertions without pinning — pass the locale
  explicitly, use `path.join()` / `os.EOL`, set `TZ`/`LANG` in the harness.
- No exact float equality — `toBeCloseTo(0.3)`, not `toBe(0.1 + 0.2)`;
  compare with a tolerance.

### Fidelity ladder: real > fake > mock

When a test needs a collaborator, prefer in this order:

1. **Real** — the production implementation. Highest fidelity.
2. **Fake** — a lightweight in-memory equivalent maintained by the real
   implementation's owner. Use when the real is too slow or network-bound.
3. **Mock** — last resort, primarily for error-path injection or when neither
   real nor fake exists.

Default-to-mocking collapses fidelity and produces mock chains that mirror
production graphs without surfacing real bugs.

### Don't mock types you don't own

If a vendor type needs to be substituted, wrap it behind your own interface
and mock the wrapper. Upstream API changes then ripple through one boundary
instead of through every test.

### E2E reserved for critical user journeys

End-to-end tests are expensive — budget about one engineer-week per quarter
per E2E test to keep stable. Reserve them for a small list of user
goal-plus-task workflows. Do not chase exhaustive E2E coverage.

### Test workflows, not just features

Features ship into a system; bugs live at the seams. When the design
introduces a feature whose behavior overlaps an existing one, the
acceptance-test list must include at least one cross-feature interaction
test.

## Completion Contract

Implementation is done when:

1. All acceptance tests pass
2. No acceptance test was modified, added, or removed
3. No existing tests regressed (the full suite passes)

If all three conditions hold, the feature is complete as specified. Proceed
to VERIFY.
