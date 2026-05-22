---
name: test-first-development
description: Acceptance tests as immutable scope fence — loaded by test-architect and orchestrator to enforce test-before-implementation discipline and completion contracts
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
