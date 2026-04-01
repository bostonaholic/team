---
name: team-test
description: Write failing acceptance tests from an approved plan. Tests form the immutable scope fence for implementation. Trigger on "write the tests first", "acceptance tests", or "/team-test".
---

# TEAM Test — Standalone Phase

Run the TEST-FIRST phase. Requires `plan.approved` in the event log.

## Execution

1. Read `~/.team/<topic>/events.jsonl`. Scan for `plan.approved`.
2. If not found: report "No approved plan. Run /team-plan first." and stop.
3. Follow the event loop — dispatches `test-architect`.
4. At the mechanical gate (`tests.written`): verify all tests fail correctly.
5. **Stop after `tests.confirmed-failing` is recorded.**

## Completion

Report test file paths and suggest: "/team-implement to execute the plan"
