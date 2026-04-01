---
name: team-fix
description: Compressed bug-fix pipeline — reproduce, write failing test, minimal fix, verify. Skips research and plan phases. Trigger on "/team-fix <bug description>".
---

# TEAM Fix — Bug Fix Pipeline

Run the compressed bug-fix pipeline. Goes straight to test-driven fix
discipline without research or planning overhead.

## Input

Bug description: `$ARGUMENTS`

If `$ARGUMENTS` is empty, ask the user to describe the bug and stop.

## When to Use

Use `/team-fix` when:
- The bug is well-understood and the affected code is known
- The fix is likely contained to a small number of files
- No architectural decisions are needed — this is a defect correction

Use `/team` (full pipeline) when:
- The root cause is unknown and needs investigation
- The fix requires designing new behavior or APIs
- Multiple subsystems may be involved

## Pipeline

```
REPRODUCE → RED (failing test) → GREEN (minimal fix) → VERIFY → SHIP
```

No research phase. No plan phase. No human gate.

## Setup

1. Create `~/.team/<topic>/` directory if it does not exist (`mkdir -p ~/.team/<topic>`).
2. Append the first event to `~/.team/<topic>/events.jsonl`:

```json
{"seq":1,"event":"bug.reported","producer":"router","ts":"<ISO-8601>","data":{"description":"<bug description>"},"artifact":null,"causedBy":null,"gate":null}
```

## Execution

Follow the test-driven-bug-fix methodology from
`skills/test-driven-bug-fix/SKILL.md`. Read that skill before proceeding.

For each phase transition, append an event to `~/.team/<topic>/events.jsonl`:

| Phase | Event | Data |
|-------|-------|------|
| Reproduce | `bug.reported` | `description`, `affectedFiles`, `reproduced`, `reproductionSteps` |
| Red | `tests.confirmed-failing` | `testName`, `failureReason` |
| Green | `implementation.completed` | `fixSummary`, `filesChanged` |
| Verify | `verification.passed` | (empty) |
| Ship | `feature.shipped` | (empty) |

**Mechanical gate between Red and Green:** the new test must fail with an
assertion failure, not a crash. Do not proceed to the fix until confirmed.

## Ship

1. Commit in two commits:
   - `test:` commit with the failing test
   - `fix:` commit with the minimal fix
2. Create a PR if working on a branch, or commit to the working branch.
3. Append `feature.shipped` event.
4. Delete `~/.team/<topic>/` directory.

## Aborting

If reproduction fails: report "Bug could not be reproduced with the given
description." and stop. Do not write a test for an unconfirmed bug.

If the fix is larger than expected (touching many files, requiring new APIs,
or revealing an architectural problem): stop, report the scope, and recommend
switching to the full `/team` pipeline.
