---
name: test-style
description: Test style rules and the flaky-test red-flag catalog — behavior-not-implementation, DAMP setup, narrow assertions, deterministic-input rules (clock, randomness, ordering, hermetic boundaries), the fidelity ladder, and the audit checklist. Load when writing tests, auditing test quality, or reviewing changed test files for flaky patterns.
user-invocable: false
---

# Test Style Rules

These rules govern every acceptance test written under
`skills/test-first-development/SKILL.md`, and they are the bar reviewers
hold changed test files to. Each rule catches a different class of
test-suite decay.

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

### Audit checklist

Before confirming failures, audit each test against this bar. Every "NO" is
an issue to fix. The rules above spell each check out in full; the bar below
is the audit checklist.

| Check | Pass criterion |
|-------|----------------|
| Behavior-named | Test name describes the behavior, not the method. `sendsEmailWhenBalanceIsLow`, not `testProcess_1`. |
| Narrow assertion | The assertion targets the specific field/effect under test. No full-equality on complex objects unless that IS the contract. |
| Actionable failure | If the test fails, the failure message names the failing condition. `EXPECT_OK(...)` not `EXPECT_TRUE(...ok())`. |
| No sleeps | No `sleep()` for synchronization. Use wait-for-condition primitives. |
| Deterministic inputs | No wall-clock reads, unseeded randomness, order-dependent or shared-state assumptions, race-interleaving assumptions, positional asserts on unordered collections, real network, hard-coded ports, or exact float equality feeding an assertion. Clock frozen/injected; RNG seeded. |
| No test logic | No `if`, no loops, no string-building inside the test body. |
| One scenario per test | The test verifies one behavior and runs independently in any order. |
| DAMP setup | Setup the reader needs to understand the test lives in the test (or a helper that takes the asserted value as a parameter). |
| Fidelity ladder | Real > fake > mock. No mocks where a fake is feasible. No mocks for types you don't own — wrap them. |

When reporting issues, cite the failing check by name (e.g., "Test 7 fails
the Narrow assertion bar — it asserts on the full order object when only
`order.total` is the slice's contract").

## Flaky-test red flags (reviewer checklist)

The reviewer-facing catalog of nondeterministic inputs. Any test whose
*outcome depends on* one of these flags on **first** occurrence — the
severity regime lives in `skills/code-review/SKILL.md` ("Flaky-test red
flags"). A time-bomb example pair lives under "Control the clock" above.

- **Time/date dependence, incl. time-bombs** — `new Date()`, `Date.now()`,
  `datetime.now()` feeding an assertion; a future date literal in a fixture
  (`expiresAt: "2030-01-01"`, cert `notAfter`); naive calendar arithmetic
  on "now" (`addMonths`, month-end/DST/leap assumptions); TZ-naive date
  construction. Past/fixed date literals with an explicit TZ do not flag.
- **Fixed-sleep / timed waits** — `sleep()` for synchronization:
  `Thread.sleep(ms)`, `setTimeout`-as-wait, `cy.wait(3000)`,
  `page.waitForTimeout(...)`; a bounded wait whose success is asserted
  (`assertTrue(latch.await(100, MS))` — a capped wait still flags).
  Tests legitimately about time require a frozen/fake clock — a real
  sleep to observe a delay still flags.
- **Concurrency / race interleaving** — assertions assuming a completion
  order across threads, `Promise.all`, or executors; shared state mutated
  without synchronization; missing `join()`/`await` before asserting.
  Order-independent assertions (`Set` comparison, sorted) do not flag.
- **Test-order dependence & shared mutable state** — static/module-level
  mutable state written by a test; state (DB row, file, env var) created
  with no teardown; a test reading state another test produced.
- **Unseeded randomness** — `Math.random()`, `uuid.v4()`, `faker.*` without
  `faker.seed(n)` feeding an assertion. Seeded randomness does not flag.
- **Real network / external services** — live URLs or SDK clients in a test
  with no stub/interceptor at the boundary.
- **Resource leaks & hard-coded ports** — a fixed port for an embedded
  server/DB (collides under parallel CI); an opened connection, file, or
  socket with no guaranteed teardown.
- **Unordered-collection order assumptions** — positional assertions on
  hash map/set iteration or on a query with no `ORDER BY`.
- **Exact float equality** — `expect(0.1 + 0.2).toBe(0.3)`; require a
  tolerance/epsilon comparison.
- **Platform/environment dependence** — hard-coded path separators or line
  endings; locale/TZ formatting asserted against a fixed string; CPU-count
  or CI-parallelism assumptions.
