### 2. Bounded cycle mechanics

Read the [watch loop](watch-loop.md). Bind its three slots:

- **Poll command** — the step-3 poll.
- **Cycle-0 subject** — feedback that already exists at arm time is
  triaged at once.
- **Handoff state** — the current baseline state: unresolved-thread ids,
  triaged review-summary and conversation-comment ids, PR `state`,
  `reviewDecision`, and head SHA.
