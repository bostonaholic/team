---
name: principle-non-blocking-waits
description: "Apply to external waits: use one backgrounded call with a reported result."
user-invocable: false
---

# Non-Blocking Waits

**Invariant:** A wait that would span turns runs as one backgrounded call; do
not occupy turns with foreground sleeps or poll a task the harness reports.

**Rules:**
- Use one Bash call with `run_in_background: true`; its completion notification
  is the wake-up.
- Put each delayed poll in that call: `sleep <interval>; <poll command>`.
- Never poll a backgrounded task for completion.
- Declare a loud terminal bound under
  `skills/principle-bounded-loops/SKILL.md`.
- Do not rely on a foreground timeout beyond the host ceiling; Claude Code
  stops foreground Bash at 600 seconds.
- If background execution is unavailable, say so and use foreground chunks
  below the host ceiling. Name this fallback at the call site.
- Keep sub-minute waits inline when they fit within one turn.

**Check:** Does this wait resume only on a result or declared terminal bound,
without foreground polling turns?
