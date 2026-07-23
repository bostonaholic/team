---
name: team-fix
description: Compressed bug-fix pipeline — reproduce, write failing test, minimal fix, verify. Skips Question/Research/Design/Structure/Plan phases. Trigger on "/team-fix <bug description>".
effort: high
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
2. **Move the ticket to in-progress.** If the input resolved to a ticket id
   or issue, move that ticket to its tracker's in-progress state — this is
   the first action of the fix, before any other work begins. Best-effort
   per the ticket-lifecycle rules in `skills/tracking-tickets/SKILL.md` —
   skip silently when no tracker mechanism exists; never block the
   pipeline on a tracker update.
3. **Derive `<id>`** the same way `/team` does (ticket-prefixed or
   date-prefixed kebab slug). Create `docs/plans/<id>/`.
4. Write a minimal `docs/plans/<id>/task.md` with the standard frontmatter
   (`topic`, `date`, `phase: task`, `ticketId`) plus a brief description
   of the bug. The `topic` value is the kebab portion of `<id>` — i.e.
   `<id>` minus the `<TICKET>-` or `<YYYY-MM-DD>-` prefix. Never use the
   ticket id, the date, or a re-worded description as the topic.
   `ticketId` lives only on `task.md`. This is the single durable record
   for the fix and lets any `/team-*` command pick it up if interrupted.
5. **Seed the TodoWrite ledger** with the bug-fix phases:
   `Reproduce → Red (failing test) → Green (minimal fix) → Verify → Ship`.
   Mark `Reproduce` as `in_progress`.
   See `skills/progress-tracking/SKILL.md` for the per-step tracking convention agents follow within each phase.

## Execution

Follow the test-driven-bug-fix methodology from
`skills/test-driven-bug-fix/SKILL.md`. Read that skill before proceeding.

When the failure is non-obvious, Load `skills/systematic-debugging/SKILL.md`
and drill its **Root Cause Analysis (5 Whys)** causal chain to the root before
proposing a fix.

Mark each TodoWrite item `in_progress` when you begin and `completed`
when it finishes.

**Mechanical gate between Red and Green:** the new test must fail with an
assertion failure, not a crash. Do not proceed to the fix until confirmed.

## Ship

1. Commit in two commits:
   - `test:` commit with the failing test
   - `fix:` commit with the minimal fix
2. **Open a draft PR automatically — do not stop to ask.** If working on
   a branch, push it and open the PR as a **draft** (`gh pr create
   --draft`). If not on a branch, commit to the working branch.
3. **Ticket — link now, in-review when ready.** If `ticketId` is non-null
   in `task.md`'s frontmatter, apply the ticket-lifecycle rules in
   `skills/tracking-tickets/SKILL.md`: link the PR to the ticket via the
   conditional closing footer, keep the ticket in-progress while the PR
   is a draft and move it to in-review only once the PR is marked ready
   for review, and never close the ticket by hand — the link auto-closes
   it on merge. Best-effort; never block. Surface the `ticketId` in the
   completion report.
4. Mark all TodoWrite items complete.

## Aborting

If reproduction fails: report "Bug could not be reproduced with the
given description." and stop. Do not write a test for an unconfirmed bug.

If the fix is larger than expected (touching many files, requiring new
APIs, or revealing an architectural problem): stop, report the scope,
and recommend switching to the full `/team` pipeline.
