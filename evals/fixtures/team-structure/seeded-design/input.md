---
agent: team-structure
tier: periodic
deps:
  - skills/team-structure/**
  - skills/slicing-work/**
  - agents/structure-planner.md
---

# Seeded-state task: slice an approved design into vertical slices

You are running the STRUCTURE phase. The eval harness writes the fenced block
below to `docs/plans/2026-06-03-token-bucket/design.md` (carrying
`approved: true`) in your working directory before you start. Read it and
produce a `structure.md`-style breakdown in your response.

The load-bearing properties: the structure breaks the work into vertical slices
where each slice has its own verification checkpoint, and it copies the topic
slug `token-bucket` verbatim from the seeded design.

Output, in your response, the `structure.md` you would write — a frontmatter
block with `topic: token-bucket`, then numbered slices. Each slice must name a
goal, the layers it touches, and an explicit verification checkpoint (how you
confirm the slice is done). Do not write files; just output the structure.

```markdown design.md
---
topic: token-bucket
date: 2026-06-03
phase: design
approved: true
approved_at: 2026-06-03T00:00:00Z
revision: 0
---

# Design: token-bucket

## Current state
Requests dispatch through `src/api/handler.js` with no per-client throttling.
The API key is validated in `src/api/auth.js:40`. Responses are built in
`src/api/respond.js`.

## Desired end state
A per-API-key token-bucket limiter caps request rate; over-limit requests get a
429 with a `Retry-After` header.

## Decisions made
1. Token bucket over fixed window (smoother bursts) — alternative fixed-window
   rejected for thundering-herd at window edges.
2. In-process bucket store for v1; Redis-backed store deferred.

## Out of scope
- Distributed/shared limits across instances.
```
