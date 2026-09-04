---
name: test-first-development
description: 'Defines test first development methodology. Load when agents need its procedure.'
user-invocable: false
---

# Test-First Development

Acceptance tests are the immutable scope fence (`principle-scope-fence`). Read
[references/procedure.md](references/procedure.md) for complete error handling,
stub limits, and the acceptance-versus-step-level distinction.

## Core Rule

Write ALL acceptance tests from the plan BEFORE any implementation code. Use
the plan's exact names; add, omit, or rename none. If boundary, invalid-input,
failure, concurrency, auth, or resource-limit cases are missing, return to PLAN.

## 1. Write every planned test

Tests assert observable outcomes and follow `skills/test-style/SKILL.md`.
Audit each against that skill's named checklist before reporting results.

## 2. Make Sure That Tests Fail Correctly

Run the full suite. Every new test must FAIL through its assertion, never ERROR;
every existing test must pass. This is a deterministic gate
(`principle-mechanical-gates`). Then run the project's static checks, including
typecheck, and make them pass. Report both results.

## 3. Fix errors, not failures

For missing imports, fixtures, types, or runner config, add only the minimum
placeholder module, fixture, type stub, or configuration required to execute.
Stubs remain visibly incomplete. Never add implementation to make a test run.

## 4. Lock the test list

After correct Red state, acceptance tests are immutable during IMPLEMENT:

- add none;
- remove none;
- change no assertions;
- rename none.

A needed change returns to PLAN; the structure regenerates the plan. There is
no approval step.

## Two test levels

- **Feature acceptance:** immutable, coarse observable behavior; defines what.
- **Step-level TDD:** Red, Green, Refactor unit tests; freely changed during
  implementation; helps build how.

## Completion Contract

Proceed to VERIFY only when all acceptance tests pass unchanged, none were
added or removed, and the full prior suite has no regression.
