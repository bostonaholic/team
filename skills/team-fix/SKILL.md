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

### Beads Integration

Check if the first token of `$ARGUMENTS` matches a beads issue ID pattern
(e.g., `team-89z`, `proj-42a`). If it does, use `/beads:show <id>` to verify
it exists. If valid:
- Use `/beads:update <id>` to claim and mark the issue as in-progress.
- Strip the beads ID from the description (use the remainder as the bug
  description). If no remainder, use the issue title from the show output.
- Set `beadsId` to the matched ID.
If the first token is not a beads ID, set `beadsId` to `null`.

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

1. Create `~/.team/<topic>/` directory if it does not exist.
2. Call `initState(topic, beadsId, today)` from `lib/state.mjs` to
   bootstrap `state.json` with `phase: 'QUESTION'`. The fix flow will
   advance the phase directly without passing through DESIGN/STRUCTURE.

## Execution

Follow the test-driven-bug-fix methodology from
`skills/test-driven-bug-fix/SKILL.md`. Read that skill before proceeding.

For each phase transition, update `state.json` via `writeState(topic, ...)`:

| Phase     | state.json update                                         |
|-----------|-----------------------------------------------------------|
| Reproduce | `phase: 'IMPLEMENT'` once the bug is reproduced on disk   |
| Red       | `writeState(topic, {})` — refresh lastUpdated             |
| Green     | `writeState(topic, {})` — still IMPLEMENT, fix in place   |
| Verify    | `phase: 'PR'` once verification passes                    |
| Ship      | `phase: 'SHIPPED'` before directory cleanup               |

**Mechanical gate between Red and Green:** the new test must fail with an
assertion failure, not a crash. Do not proceed to the fix until confirmed.

## Ship

1. Commit in two commits:
   - `test:` commit with the failing test
   - `fix:` commit with the minimal fix
2. Create a PR if working on a branch, or commit to the working branch.
3. If `beadsId` is non-null in `state.json`, use `/beads:close <beadsId>`
   to mark the issue as done.
4. `writeState(topic, { phase: 'SHIPPED' })`.
5. Delete `~/.team/<topic>/` directory.

## Aborting

If reproduction fails: report "Bug could not be reproduced with the given
description." and stop. Do not write a test for an unconfirmed bug.

If the fix is larger than expected (touching many files, requiring new APIs,
or revealing an architectural problem): stop, report the scope, and recommend
switching to the full `/team` pipeline.
