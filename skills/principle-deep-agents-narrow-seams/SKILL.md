---
name: principle-deep-agents-narrow-seams
description: "Apply when designing an agent, subagent, or dispatch boundary. Keep complexity inside the worker and the seam narrow: declared inputs in, one bounded output back."
user-invocable: false
---

# Deep Agents, Narrow Seams

Each agent is a deep module behind a narrow interface: read the declared
predecessor inputs, do one job well, produce exactly one bounded output.
The complexity lives inside the agent; the seam between agents stays
simple — the declared predecessor artifacts in, one bounded output back:
an artifact written to disk or a report returned as text (the dispatcher
persists what must outlive the turn).

**Why:** Narrow seams make the roster swappable, the pipeline legible, and
failures local. A crash in one agent is contained to one phase instead of
cascading down the line.

**Pattern:**
- The declared predecessor artifacts in — one where one suffices — and
  exactly one bounded output back: an artifact on disk or a returned
  report the dispatcher persists. An agent never reaches around its
  declared inputs to peek at another agent's state.
- Keep orchestration in the orchestrator. A specialist that routes,
  retries siblings, or walks the phase table has absorbed a second job.
- Split a "utility" agent that quietly does five unrelated things.
- Bound the depth: instruct every helper to do its work directly and never
  to spawn further sub-agents.
- Bound the reply: a helper returns a short, stated maximum, and the
  dispatcher owns everything it relays.
