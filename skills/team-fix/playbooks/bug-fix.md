# Bug-fix playbook

## Root-cause correction

Read and apply [Fix Root Causes](../../principle-fix-root-causes/SKILL.md). It owns the debugging invariant: reproduce before fixing, ask why to the changeable cause, resist guards that silence a crash, fix the pattern rather than the instance, instrument instead of guessing, and suspect stale persistent state after a restart. Add an absence guard only when absence is legal; otherwise correct why the value is missing. Search for sibling occurrences: fix only those inside approved scope and record the rest without editing them. Make the smallest scoped correction and verify the reproduction and affected callers.

## Triage

Classify first:

- **Product:** continue with the reproduce-fix-verify discipline below.
- **Test impl:** fix the test separately; never change production for a bad test.
- **Infra:** fix the environment, not product behavior.
- **Tooling:** fix the runner or build system.

Intermittency is not a fifth bucket. Read [diagnosis reference](../references/diagnosis.md) to reproduce it, and its Root Cause Analysis (5 Whys) for non-obvious causes.

## Step 1: Reproduce

Before any code change, reliably reproduce the failure. Record exact inputs, actual and expected behavior, and affected files/functions. Observe; do not hypothesize a fix.

## Step 2: Write a failing test

Read the [testing rules](../../team/references/testing.md), including `No tautological tests`, then write a test that reproduces the bug with the exact scenario, asserts correct behavior (not current behavior), fails through the intended assertion (not infrastructure), and names the behavior (not a bug number or method).

Audit it against the testing checklist. Run it and the existing suite. The new test must fail for the right reason and all prior tests must pass. Do not continue without this Red state.

## Step 3: Fix minimally

Change only code causing the defect. Do not refactor, extend scope, alter the test, or fix adjacent bugs. Run tests after each change. Green means the new and existing tests pass.

## Step 4: Verify

1. Run the full suite; undo and investigate any regression.
2. Re-run the original inputs.
3. Search for related instances and file them separately.
4. Mutation-check the regression test: temporarily revert one fix line and require the new test to fail. Restore it. If it stays green, strengthen the assertion or reproduction.

## Commits

Keep two atomic commits:

```text
test: reproduce <bug description> with failing test
fix: <minimal description of the fix>
```
