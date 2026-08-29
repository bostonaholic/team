---
name: principle-deep-agents-narrow-seams
description: "Apply when designing an agent, subagent, or dispatch boundary. Keep complexity inside the worker and the seam a file path in and a file path out."
user-invocable: false
---

# Deep Agents, Narrow Seams

Each agent is a deep module behind a narrow interface: read one
predecessor artifact, do one job well, write one artifact. The complexity
lives inside the agent; the seam between agents stays simple — a file path
in and a file path out.

**Why:** Narrow seams make the roster swappable, the pipeline legible, and
failures local. A crash in one agent is contained to one phase instead of
cascading down the line.

**Pattern:**
- One predecessor artifact in, one artifact out. An agent never reaches
  around its input artifact to peek at another agent's state.
- Keep orchestration in the orchestrator. A specialist that routes,
  retries siblings, or walks the phase table has absorbed a second job.
- Split a "utility" agent that quietly does five unrelated things.
- Bound the depth: instruct every helper to do its work directly and never
  to spawn further sub-agents.
- Bound the reply: a helper returns a short, stated maximum, and the
  dispatcher owns everything it relays.
