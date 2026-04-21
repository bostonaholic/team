---
name: team-resume
description: Resume an interrupted TEAM pipeline from where it left off. Replays ~/.team/<topic>/events.jsonl and continues from the last recorded event. Trigger on "resume the pipeline", "continue where we left off", or "/team-resume".
---

# TEAM Resume — Pipeline Recovery

Resume an interrupted pipeline by replaying the event log.

## Execution

1. Read `~/.team/<topic>/events.jsonl`.
2. If the file does not exist: report "No active pipeline. Run /team to start." and stop.
3. Replay the log to derive current state:
   - Find the last recorded event
   - Determine which phase the pipeline is in
   - Identify the next expected event(s) from the registry
4. Report the current position to the user:
   - Topic, current phase, last event, event count
   - Any partial work detected (e.g., `files.found` without `research.completed`,
     `design.drafted` without `design.approved`/`design.revision-requested`)
5. Resume the event loop from the current position.

## How It Works

The event log IS the pipeline state. There is no separate state file to
reconcile. The router reads the log, finds what has been done, and picks up
from the next undone step. This is trivial with event sourcing — the same
loop that runs the full pipeline also handles resume.

## QRSPI partial-work signals

| Signal | What it means |
|---|---|
| `task.captured` without `research.completed` | Question done, research interrupted |
| `files.found` without `research.completed` | File-finder done, researcher interrupted (or join pending) |
| `design.drafted` without `design.approved`/`design.revision-requested` | Awaiting human gate |
| `structure.drafted` without `structure.approved`/`structure.revision-requested` | Awaiting human gate |
| `plan.drafted` without `worktree.prepared` | Worktree creation interrupted |
| `tests.written` without `tests.confirmed-failing` | Mechanical gate failed or pending |
| `slice.completed` events without `implementation.completed` | Implementer mid-execution |
| `implementation.completed` without all 5 review events | Verification fanout in progress |
