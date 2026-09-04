---
name: test-driven-bug-fix
description: 'Defines test driven bug fix methodology. Load when agents need its procedure.'
user-invocable: false
---

# Test-Driven Bug Fix

Prove each bug and pin its behavior before changing production code. Read
[references/procedure.md](references/procedure.md) for detailed checks, examples,
and commit templates.

## Triage

Classify first:

- **Product:** continue below.
- **Test impl:** fix the test separately; never change production for a bad test.
- **Infra:** fix the environment, not product behavior.
- **Tooling:** fix the runner or build system.

Intermittency is not a fifth bucket. Use `systematic-debugging` to reproduce it
and its Root Cause Analysis (5 Whys) for non-obvious causes.

## Step 1: Reproduce

Before any code change, reliably reproduce the failure. Record exact inputs,
actual and expected behavior, and affected files/functions. Observe; do not
hypothesize a fix.

## Step 2: Write a Failing Test

Write a test that:

- **Reproduces the bug** with the exact scenario.
- asserts correct behavior, not current behavior;
- fails through the intended assertion, not infrastructure;
- names the behavior, not a bug number or method.

Run it and the existing suite. The new test must fail for the right reason and
all prior tests must pass. Do not continue without this Red state.

## Step 3: Fix Minimally

Change only code causing the defect. Do not refactor, extend scope, alter the
test, or fix adjacent bugs. Run tests after each change. Green means the new and
existing tests pass.

## Step 4: Verify

1. Run the full suite; undo and investigate any regression.
2. Re-run the original inputs.
3. Search for related instances and file them separately.
4. Mutation-check the regression test: temporarily revert one fix line and
   require the new test to fail. Restore it. If it stays green, strengthen the
   assertion or reproduction.

## Commits

Keep two atomic commits:

```text
test: reproduce <bug description> with failing test
fix: <minimal description of the fix>
```

The fix targets the root cause (`principle-fix-root-causes`). It is not a
refactor, feature, or workaround.
