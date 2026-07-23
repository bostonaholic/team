---
agent: eng-design-doc-review
tier: periodic
deps:
  - skills/eng-design-doc-review/**
---

# Adversarial design-doc review with a planted gap

You are adversarially reviewing the design-doc excerpt below with fresh
context. Apply the eng-design-doc-review brief: walk the design against the
technical-design-doc methodology, audit each decision for a named alternative
and an honest trade-off, and verify edge-case enumeration. Use Conventional
Comments (`issue (blocking):`, `suggestion (non-blocking):`, `nitpick`) with a
`file:line` reference for every finding, and end with a verdict (APPROVE,
REQUEST CHANGES, or COMMENT).

The design doc under review (`design.md`):

```markdown
# Design: session-cache

## Current state
Sessions are read from Postgres on every request.

## Desired end state
A Redis cache fronts session reads.

## Decisions made
1. We will use Redis for the session cache.

## Out of scope
- Cache invalidation strategy.
```

This excerpt has a planted weakness: Decision 1 is a single-option "decision"
that names no alternative considered (e.g. Memcached, in-process LRU) and
states no trade-off — it records *what* was chosen but not *why* over the
alternatives. The doc also has no Open Questions section and no edge-case
enumeration (failure path when Redis is unreachable, staleness, concurrency).
Surface these as blocking issues.
