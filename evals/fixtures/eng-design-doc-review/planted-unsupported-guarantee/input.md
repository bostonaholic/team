---
agent: eng-design-doc-review
tier: periodic
deps:
  - skills/team/principles/durable-state.md
  - skills/team/principles/focused-work.md
  - skills/team/principles/independent-review.md
  - skills/team/principles/verified-results.md
  - skills/eng-design-doc-review/references/design-reviewer.md
  - skills/team/references/design-template.md
  - skills/team/references/decisions.md
  - skills/code-review/references/findings.md
  - skills/code-review/references/code-reviewer.md
  - skills/team/references/code-standards.md
  - skills/team/references/artifacts.md
  - skills/eng-design-doc-review/**
---

# Adversarial design-doc review with an unsupported guarantee

You are adversarially reviewing the design-doc excerpt below with fresh
context. Apply the design reviewer brief: walk the design against the design
template, audit each decision for a named alternative and an honest trade-off,
and verify edge-case enumeration. Use Conventional Comments
(`issue (blocking):`, `suggestion (non-blocking):`, `nitpick`) with a
`file:line` reference for every finding, and end with a verdict (APPROVE,
REQUEST CHANGES, or COMMENT).

The design doc under review (`6-design.md`):

```markdown
# Design: rate-limiter

## Current state
Requests reach the API with no per-client throttling. One client can exhaust
the backend.

## Desired end state
A per-client token bucket throttles requests before they reach the handler.
The limiter is thread-safe.

## Decisions made
1. Use an in-memory token bucket keyed by API key.

## Out of scope
- Persistence across restarts.
```

The planted weakness: the design asserts the limiter "is thread-safe" without
naming any lock, synchronization, or concurrency mechanism. That is a
consequential unsupported guarantee — a hazard a small experiment may not
reproduce — so the review must flag it as blocking rather than dismiss it as an
untested possibility. Surface it as an issue.
