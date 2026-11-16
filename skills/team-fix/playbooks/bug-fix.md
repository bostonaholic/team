# Bug-fix playbook

## Root-cause correction

Fix the root cause, not the symptom: ask why until you reach a changeable cause, never add a guard that silences a crash, fix the pattern rather than the instance, and after a restart suspect stale persistent state (config, caches, lock files, serialized state) before code. Add an absence guard only when absence is legal; otherwise correct why the value is missing. Fix sibling occurrences only inside approved scope; record the rest without editing them. Make the smallest scoped correction; verify the reproduction and affected callers.

## Triage

Classify first:

- **Product:** continue to Step 1.
- **Test impl:** fix the test separately; never change production for a bad test.
- **Infra:** fix the environment, not product behavior.
- **Tooling:** fix the runner or build system.

Intermittency is not a fifth bucket: use the [diagnosis reference](../references/diagnosis.md) to reproduce it, and its Root Cause Analysis (5 Whys) for non-obvious causes.

## Step 1: Reproduce

Before any code change, reliably reproduce the failure. Record exact inputs, actual and expected behavior, and affected files/functions. Do not hypothesize a fix.
