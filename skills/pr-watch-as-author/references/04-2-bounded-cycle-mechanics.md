### 2. Bounded cycle mechanics

Read the [watch loop](watch-loop.md). Bind its three slots:

- **Poll command** — the step-3 poll.
- **Cycle-0 subject** — feedback that already exists at arm time is
  triaged at once, and CI failures that already exist at arm time are
  handled at once by [CI checks](08-ci-checks.md).
- **Handoff state** — the current baseline state: unresolved-thread ids,
  triaged review-summary and conversation-comment ids, PR `state`,
  `reviewDecision`, and the head SHA that the step-3 poll reads.
