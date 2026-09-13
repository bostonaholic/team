# Execution

## Loop and output limits

Declare each loop's bound at its owning operation: count, watch duration, poll budget, concurrency, or terminal verdict.
At a count cap, halt loudly and report unresolved state. Never restart, extend, or soften exit criteria.
Missing or malformed verdicts retry once with the error, then halt. Valid correctness-review retries have no count cap.
DESIGN ends on the reviewer's passing verdict. IMPLEMENT ends when no Blocking or Major finding remains. The operator remains the outer bound.
Keep operation-specific watch, CLI, and upload limits beside those operations.
Preserve the ~200-line design budget, ≤30-line helper replies, and declared byte limits.
Restructure excess output by removing whole named units. Never truncate silently.

## External waits

Background CI, reviewer, vendor CLI, and long-job waits in one call ending with the awaited task.
Use `run_in_background: true` when supported. Put `sleep <interval>; <poll command>` inside that call, one call per bounded cycle.
Use harness completion notifications. Never poll a background task with `sleep 120; wc -c <output-file>` loops.
When background execution is unavailable, state the fallback and use foreground chunks below the harness ceiling.
Inline waits are suitable below roughly one minute, such as a few seconds after push.
Claude Code kills foreground Bash at 600 seconds. `timeout 1800` still dies at that ceiling with exit 143.
Do not evade it with `sleep 570`, `sleep 590`, or `sleep 600`.

## Progress tracking

A convention, not a gate: create no artifact and block nothing for tracking alone.
Before two or more dependent steps, seed one todo per step. Omit one-item ledgers.
Without a todo tool, state the ledger once inline and name each completed step.
Track numbered steps. For unnumbered work, track natural units such as slices or findings, never individual guidance sentences.
Use `in_progress` at start and `completed` when done.
The orchestrator owns one phase ledger. Agents own their local sub-step ledgers. Never merge or read across those ledgers.
Standalone skills own their ledgers. The [feature playbook](playbooks/feature.md) owns the orchestrator's phase-specific seed rules.
