---
name: principle-non-blocking-waits
description: 'Defines non blocking waits. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# Non-Blocking Waits

Background external waits—CI, reviewers, vendor CLIs, long jobs—in one call ending with the awaited task; never foreground `sleep` or poll tasks whose completion the harness reports.

- Use one Bash call with `run_in_background: true`; its completion notification wakes the session without a foreground ceiling.
- Put each poll in that call: `sleep <interval>; <poll command>`; use one call per bounded cycle.
- Never poll a backgrounded task with loops such as `sleep 120; wc -c <output-file>`.
- Apply `principle-bounded-loops`: declare the cap and make exhaustion loud and terminal.
- If background execution is unavailable, state the fallback at the call site and chunk foreground waits below the harness ceiling.
- Wait inline only below roughly a minute, such as a few seconds after push; background waits that would otherwise fragment.
- Preserve the constraint: Claude Code kills foreground Bash at 600 s; `timeout 1800` still dies after ten minutes with exit 143.
- Never size around that ceiling with `sleep 570`, `sleep 590`, or `sleep 600`; a 24-hour foreground watch costs ~192 turns and re-sends context.
