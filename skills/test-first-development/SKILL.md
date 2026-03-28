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

## Completion Contract

Implementation is done when:

1. All acceptance tests pass
2. No acceptance test was modified, added, or removed
3. No existing tests regressed (the full suite passes)

If all three conditions hold, the feature is complete as specified. Proceed
to VERIFY.
