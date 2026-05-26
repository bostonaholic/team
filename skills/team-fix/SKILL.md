---
name: team-fix
description: Compressed bug-fix pipeline — reproduce, write failing test, minimal fix, verify. Skips Question/Research/Design/Structure/Plan phases. Trigger on "/team-fix <bug description>".
argument-hint: "<ticket id, issue URL, or bug description>"
---

# Team Fix — Bug Fix Pipeline

Run the compressed bug-fix pipeline. Goes straight to test-driven fix
discipline without the full QRSPI ceremony.

## Input

`$ARGUMENTS` may be:

- A ticket identifier (e.g. `ENG-1234`) — set aside as `ticketId` on
  `task.md`.
- An issue URL — fetched via `gh issue view` to extract title and body.
- Free-form text — treated as the bug description.

When `$ARGUMENTS` is empty, **discover, don't demand**: ground in repo context
before asking. Read recent `git log` activity and the repo's `README` /
`CLAUDE.md` to surface the likely failing area, then use `AskUserQuestion` with
labeled options to fill any genuine gap. Never bare-stop with a plain "describe
the bug" demand when context is available.

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

No Question. No Research. No Design. No Structure. No Plan. No human gate.

## Setup

1. **Resolve the input** to a bug description first. On empty `$ARGUMENTS`,
   ground in repo context, then ask only for genuine gaps, per the
   **"discover, don't demand"** rule in `## Input`. A ticket id or issue URL is
   resolved as `## Input` describes (`gh issue view` for URLs).
2. **Derive `<id>`** the same way `/team` does (ticket-prefixed or
   date-prefixed kebab slug). Create `docs/plans/<id>/`.
3. Write a minimal `docs/plans/<id>/task.md` with the standard frontmatter
   (`topic`, `date`, `phase: task`, `ticketId`) plus a brief description
   of the bug. The `topic` value is the kebab portion of `<id>` — i.e.
   `<id>` minus the `<TICKET>-` or `<YYYY-MM-DD>-` prefix. Never use the
   ticket id, the date, or a re-worded description as the topic.
   `ticketId` lives only on `task.md`. This is the single durable record
   for the fix and lets any `/team-*` command pick it up if interrupted.
4. **Seed the TodoWrite ledger** with the bug-fix phases:
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
3. If `ticketId` is non-null in `task.md`'s frontmatter, surface it so
   the user can close the ticket. The orchestrator does not close
   tickets automatically.
4. Mark all TodoWrite items complete.

## Aborting

If reproduction fails: report "Bug could not be reproduced with the
given description." and stop. Do not write a test for an unconfirmed bug.

If the fix is larger than expected (touching many files, requiring new
APIs, or revealing an architectural problem): stop, report the scope,
and recommend switching to the full `/team` pipeline.
