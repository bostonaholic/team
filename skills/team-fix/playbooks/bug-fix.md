# Bug-fix playbook

## Root-cause correction

Fix the root cause, not the symptom: ask why until you reach a changeable cause, never add a guard that silences a crash, fix the pattern rather than the instance, and after a restart suspect stale persistent state (config, caches, lock files, serialized state) before code. Add an absence guard only when absence is legal; otherwise correct why the value is missing. Fix sibling occurrences only inside approved scope; record the rest without editing them. Make the smallest scoped correction; verify the reproduction and affected callers.

## Triage

Classify first:

- **Product:** continue with the steps below.
- **Test impl:** fix the test separately; never change production for a bad test.
- **Infra:** fix the environment, not product behavior.
- **Tooling:** fix the runner or build system.

Intermittency is not a fifth bucket: use the [diagnosis reference](../references/diagnosis.md) to reproduce it, and its Root Cause Analysis (5 Whys) for non-obvious causes.

## Step 1: Reproduce

Before any code change, reliably reproduce the failure. Record exact inputs, actual and expected behavior, and affected files/functions. Do not hypothesize a fix.

## Step 2: Write a failing test

Read the [testing rules](../../team/references/testing.md), including `No tautological tests` and the [regression tests](../../team/references/testing.md#regression-tests) rule. Write one test at the owner boundary that reproduces the exact scenario, asserts correct (not current) behavior, fails through the intended assertion (not infrastructure), and is named for the behavior (not a bug number or method).

Audit it against the testing checklist. Run it and the existing suite: continue only when the new test fails for the right reason and all prior tests pass.

## Step 3: Fix minimally

Change only the code causing the defect: no refactor, scope extension, test change, or adjacent fix. Green means the new and existing tests pass.

## Step 4: Verify

1. Run the full suite; undo and investigate any regression.
2. Re-run the original inputs.
3. Search for related instances and file them separately.
4. Mutation-check: temporarily revert one fix line and require the new test to fail, then restore it. If it stays green, strengthen the assertion or reproduction.

## Commits

Two atomic commits:

```text
test: reproduce <bug description> with failing test
fix: <minimal description of the fix>
```

The `test:` commit body records the Red run: the command and the failing assertion line from the pre-fix run.
