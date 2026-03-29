---
name: test-driven-bug-fix
description: Test-driven bug fix methodology — loaded by the bug-fix pipeline to enforce reproduce-first, red-green discipline when fixing defects
---

# Test-Driven Bug Fix

A bug without a failing test is an unverified assumption. A bug fixed without
a failing test may be fixed correctly this time, but has no protection against
regression. The test-driven bug fix discipline ensures that every fix is:

1. **Reproduced** — the bug is confirmed to exist before any code changes
2. **Pinned** — a failing test locks in the expected correct behavior
3. **Fixed minimally** — the smallest change that makes the test pass
4. **Verified** — no regression in existing behavior

## The Four-Step Discipline

### Step 1: Reproduce

Before writing any code, reproduce the bug. Understanding exactly when and
why the bug occurs is the prerequisite for everything that follows.

- Run the failing scenario manually or via existing tests
- Identify the exact inputs that trigger the bug
- Understand what the system does (actual behavior) versus what it should
  do (expected behavior)
- Identify which file(s) and function(s) are involved

Do not hypothesize a fix during this step. Observe first.

**Reproduction is complete when you can reliably trigger the bug on demand.**

### Step 2: Write a Failing Test

Write a test that:

- **Reproduces the bug** — the test exercises the exact scenario that
  triggers the bug
- **Asserts the correct behavior** — the assertion captures what should
  happen, not what currently happens
- **Fails for the right reason** — the test fails with an assertion
  failure (wrong behavior), not an error (broken test infrastructure)

Name the test to document the bug scenario: `test_returns_error_when_token_is_expired`,
not `test_bug_123` or `test_fix`.

Run the test suite and confirm:
- The new test FAILS (the bug exists)
- The new test fails with an assertion failure, not a crash or error
- All existing tests still pass (the test itself is not broken)

**This is the "Red" state. Do not proceed until the test fails correctly.**

### Step 3: Fix Minimally

Apply the smallest change that makes the failing test pass.

- **Minimal means minimal.** Change only the code that produces the wrong
  behavior. Do not refactor, improve, or extend.
- **Do not change the test.** The test defines correct behavior. If the test
  is wrong, that is a separate problem — do not fix the code to match wrong
  tests.
- **Do not fix other bugs found along the way.** If you discover a related
  bug, note it. File it for later. Fix only the targeted bug.
- **After each change, run the tests.** The failing test should move from
  failing to passing. No existing test should start failing.

**This is the "Green" state. The targeted test passes, all other tests pass.**

### Step 4: Verify

After the fix:

1. **Run the full test suite.** Every existing test must pass. If any test
   now fails that passed before, the fix introduced a regression — undo and
   investigate.

2. **Re-run the reproduction case.** Confirm that the original bug no longer
   occurs with the original inputs.

3. **Check for related instances.** If the root cause is a pattern (e.g.,
   missing null check), search the codebase for the same pattern. File issues
   for related instances — do not fix them in this commit.

4. **Review the minimal fix.** Is the fix correct, or did it just make the
   symptom go away? A fix that hides the bug without addressing the root
   cause will recur.

## Commit Structure

Each step produces a commit:

```
test: reproduce <bug description> with failing test

Adds a test that fails due to the bug described in <issue reference>.
The test will pass once the fix is applied.
```

```
fix: <minimal description of the fix>

Fixes the root cause identified in the preceding test commit.
All tests now pass including the new reproduction test.

Closes #<issue>
```

Keeping the test commit and fix commit separate makes the intention clear:
the test proves the bug existed, the fix makes it go away.

## What This Is NOT

- **Not a refactoring opportunity.** Bug fixes are not the time to improve
  the surrounding code. The scope is: broken test passes, no regressions.
- **Not a feature addition.** If the correct behavior requires new
  functionality beyond restoring the previous intent, that is a feature, not
  a bug fix.
- **Not a workaround.** A workaround avoids the buggy code path. A fix
  corrects the buggy code. When in doubt, fix the root cause.
