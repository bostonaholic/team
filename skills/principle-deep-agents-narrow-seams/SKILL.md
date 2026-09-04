---
name: principle-deep-agents-narrow-seams
description: 'Keeps agent interfaces narrow and internal work deep. Apply when defining an agent, subagent, or dispatch boundary.'
user-invocable: false
---

# Deep Agents, Narrow Seams

Give each agent one job behind this interface: the declared predecessor artifacts in, one bounded output back—an artifact written to disk or a report returned as text.

- Use one predecessor where sufficient; never inspect undeclared agent state.
- Let the dispatcher persist returned reports that must outlive the turn.
- Keep routing, sibling retries, and the phase table in the orchestrator.
- Split utility agents that perform unrelated jobs.
- Require helpers to work directly and never spawn further sub-agents.
- State a short maximum for helper replies; the dispatcher owns relayed content.
