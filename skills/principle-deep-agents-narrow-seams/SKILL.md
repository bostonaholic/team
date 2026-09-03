---
name: principle-deep-agents-narrow-seams
description: "Apply when designing agents: use declared inputs and one bounded output."
user-invocable: false
---

# Deep Agents, Narrow Seams

**Invariant:** An agent reads only declared predecessor inputs, does one job,
and returns exactly one bounded output.

**Rules:**
- Accept one predecessor artifact where one suffices. Never inspect undeclared
  agent state.
- Return one artifact or one report; the dispatcher persists anything that must
  outlive the turn.
- Keep routing, sibling retries, and phase progression in the orchestrator.
- Split agents that perform unrelated jobs.
- Helpers work directly and never spawn sub-agents. State a reply limit; the
  dispatcher owns all relayed content.

**Check:** Does this agent expose only declared inputs and one bounded output?
