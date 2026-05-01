---
name: team-fix
description: Compressed bug-fix pipeline — reproduce, write failing test, minimal fix, verify. Skips Question/Research/Design/Structure/Plan phases. Trigger on "/team-fix <bug description>".
---

# TEAM Fix — Bug Fix Pipeline

Run the compressed bug-fix pipeline. Goes straight to test-driven fix
discipline without the full QRSPI ceremony.

## Input

Bug description: `$ARGUMENTS`

If `$ARGUMENTS` is empty, ask the user to describe the bug and stop.

### Tracking Ticket

If the first token of `$ARGUMENTS` looks like a ticket identifier
(e.g., a kebab-case `<system>-<id>` slug), set it aside as `ticketId`
and strip it from the rest of the description. The TEAM pipeline does
not integrate with any specific ticketing system — the ID is recorded
on `task.md` for the user's reference and for any project-specific
automation they may layer on top. If the first token does not look
like a ticket ID, treat all of `$ARGUMENTS` as the bug description and
leave `ticketId` as `null`.

## When to Use

Use `/team-fix` when:
- The bug is well-understood and the affected code is known
- The fix is likely contained to a small number of files
- No architectural decisions are needed — this is a defect correction

Use `/team` (full QRSPI pipeline) when:
- The root cause is unknown and needs investigation
- The fix requires designing new behavior or APIs
- Multiple subsystems may be involved
- The user wants to align on the approach before code is written

## Pipeline

```
REPRODUCE → RED (failing test) → GREEN (minimal fix) → VERIFY → SHIP
```

No Question phase. No Research. No Design. No Structure. No Plan. No human gate.

## Setup

1. Write a minimal `docs/plans/<today>-<topic>-task.md` with the standard
   task.md frontmatter (`topic`, `date`, `phase: task`, `ticketId`) plus
   a brief description of the bug. This is the single durable record for
   the fix and lets any /team-* command pick it up if interrupted.
2. **Seed the TodoWrite ledger** with the bug-fix phases:
   `Reproduce → Red (failing test) → Green (minimal fix) → Verify → Ship`.
   Mark `Reproduce` as `in_progress`.

## Execution

Follow the test-driven-bug-fix methodology from
`skills/test-driven-bug-fix/SKILL.md`. Read that skill before proceeding.

Mark each TodoWrite item `in_progress` when you begin and `completed`
when it finishes.

**Mechanical gate between Red and Green:** the new test must fail with an
assertion failure, not a crash. Do not proceed to the fix until confirmed.

## Ship

1. Commit in two commits:
   - `test:` commit with the failing test
   - `fix:` commit with the minimal fix
2. Create a PR if working on a branch, or commit to the working branch.
3. If `ticketId` is non-null in `task.md`'s frontmatter, the user may want to close the ticket in their tracking system. The orchestrator does not close tickets automatically.
4. Mark all TodoWrite items complete.

## Aborting

If reproduction fails: report "Bug could not be reproduced with the given
description." and stop. Do not write a test for an unconfirmed bug.

If the fix is larger than expected (touching many files, requiring new APIs,
or revealing an architectural problem): stop, report the scope, and recommend
switching to the full `/team` pipeline.
