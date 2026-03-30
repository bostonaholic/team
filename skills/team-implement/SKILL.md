---
name: team-implement
description: Dispatch the implementer agent to execute the plan step by step, making failing tests pass. Trigger on "implement the plan", "start implementing", or "/team-implement".
---

# TEAM Implement — Standalone Phase

Run the IMPLEMENT phase. Requires `tests.confirmed-failing` in the event log.

## Execution

1. Read `~/.team/events.jsonl`. Scan for `tests.confirmed-failing`.
2. If not found: report "No confirmed tests. Run /team-test first." and stop.
3. Dispatch the `implementer` agent.
4. The implementer works through the plan, emitting `step.completed` events.
5. **Stop after `implementation.completed` is recorded.**

## Completion

Report which tests pass and suggest: "/team-verify to run reviews"
