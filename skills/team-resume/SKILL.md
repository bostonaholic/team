---
name: team-resume
description: Resume an interrupted TEAM pipeline from where it left off. Replays ~/.team/events.jsonl and continues from the last recorded event. Trigger on "resume the pipeline", "continue where we left off", or "/team-resume".
---

# TEAM Resume — Pipeline Recovery

Resume an interrupted pipeline by replaying the event log.

## Execution

1. Read `~/.team/events.jsonl`.
2. If the file does not exist: report "No active pipeline. Run /team to start." and stop.
3. Replay the log to derive current state:
   - Find the last recorded event
   - Determine which phase the pipeline is in
   - Identify the next expected event(s) from the registry
4. Report the current position to the user:
   - Topic, current phase, last event, event count
   - Any partial work detected (e.g., files.found without research.completed)
5. Resume the event loop from the current position.

## How It Works

The event log IS the pipeline state. There is no separate state file to
reconcile. The router reads the log, finds what has been done, and picks up
from the next undone step. This is trivial with event sourcing — the same
loop that runs the full pipeline also handles resume.
