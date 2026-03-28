---
name: team-test
description: Write failing acceptance tests from an approved plan. Tests form the immutable scope fence for implementation. Trigger on "write the tests first", "acceptance tests", or "/team-test".
---

# TEAM Test — Test-First Development

You run the TEST-FIRST phase of the TEAM pipeline. This creates the
acceptance tests that define the immutable scope fence for implementation.

## Prerequisites

A plan artifact is required. Check for it:

1. Read `.team/state.json` for `planPath`
2. If `planPath` is set, verify the file exists on disk
3. If no plan artifact is found, report the error:
   "No approved plan found. Run `/team-plan` first to create and approve
   an implementation plan."
   **Stop here.** Do not proceed without a plan.

## Setup

Update `.team/state.json`:
- Set `phase: "TEST-FIRST"`

## Execution

Dispatch **test-architect** with instructions to:

- Read the plan artifact at the path in state
- Write ALL acceptance tests defined in the plan's Tests section
- Follow existing test conventions discovered during research
- Confirm every test fails with an assertion failure (not a runtime error)

## Verification

After the test-architect completes:

1. **Check the report.** The test-architect returns a table of tests written,
   their file paths, and failure reasons.

2. **Validate all tests fail cleanly.** Run the test suite yourself to
   confirm:
   - Every acceptance test FAILS (because implementation does not exist)
   - No test ERRORS or CRASHES (test infrastructure is sound)
   - Existing tests still PASS (no regressions from test setup)

3. **Fix issues if needed.** If any test errors instead of failing:
   - Check for missing imports or module stubs
   - Check for missing fixture data
   - Check for test configuration problems
   - Fix the minimal scaffolding needed and re-run

4. **Record test files.** Update `.team/state.json` with the `testFiles`
   array listing every test file created or modified.

## Completion

Report to the user:

- Number of acceptance tests written
- All tests fail cleanly: YES/NO
- List of test files created
- Suggest: "Run `/team-implement` to start making these tests pass."

## Scope Rules

- The plan's test list is the scope fence. Do NOT write tests beyond what
  the plan specifies.
- Do NOT write implementation code. Only create the minimum stubs needed
  for tests to fail (not error).
- If the plan's test list appears incomplete, report the concern but write
  only what the plan specifies. The plan was approved — honor it.

## Error Handling

- If the test-architect fails, report which tests were written before the
  failure and which remain.
- If some tests cannot be made to fail cleanly, flag them individually
  rather than blocking the entire phase.
