---
name: test-first-development
description: Write and mechanically validate all planned acceptance tests before implementation.
user-invocable: false
---

# Test-First Development

Mechanical checks enforce this contract
(`skills/principle-mechanical-gates/SKILL.md`).

## Input

The plan's exact acceptance-test names and descriptions. They are the scope
fence under `skills/principle-scope-fence/SKILL.md`.

## Core Rule

Write ALL acceptance tests from the plan BEFORE any implementation code.

## Process

> Follow `skills/principle-progress-tracking/SKILL.md`.

### 1. Write Every Test From the Plan

Write every named test exactly once. Add, omit, or rename none. If the list
lacks designed boundary, invalid-input, failure, concurrency, authorization,
or resource-limit cases, return to PLAN; do not expand scope here.

### 2. Make Sure That Tests Fail Correctly

Run the full suite. Every new test must fail by assertion, not crash or error;
all existing tests must pass. Then run every configured static check,
including typecheck. Report the failure table and static-check result.

### 3. Fix Errors, Not Failures

For missing imports, fixtures, types, or runner config, add only the minimal
stub needed to execute the test. Stubs stay visibly incomplete. Never add
implementation merely to make a test runnable.

### 4. Lock the Test List

During implementation, do not add, remove, rename, or change acceptance-test
assertions. A necessary change returns to PLAN and regenerates the plan from
the structure; there is no approval gate.

## Two Levels of Testing

- **Feature-level acceptance tests:** immutable external-behavior scope fence.
- **Step-level TDD:** mutable Red/Green/Refactor unit tests used during
  implementation.

## Test Style Rules

Audit every acceptance test against `skills/test-style/SKILL.md` before
confirming red. Cite each failed checklist item by name.

## Completion Contract

Implementation is done only when all acceptance and existing tests pass and
the acceptance-test list is unchanged. Then proceed to VERIFY.
