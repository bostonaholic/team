---
agent: team-plan
tier: periodic
deps:
  - skills/team-plan/**
  - skills/planning-implementation/**
  - agents/planner.md
---

# Seeded-state task: expand an approved structure into a tactical plan

You are running the PLAN phase. The eval harness writes the fenced block below
to `docs/plans/2026-06-03-token-bucket/structure.md` (carrying
`approved: true`) in your working directory before you start. Read it and
produce a `plan.md`-style tactical plan in your response.

The load-bearing properties: the plan expands each structure slice into
file-level steps and maps each slice to its acceptance tests, and it copies the
topic slug `token-bucket` verbatim from the seeded structure.

Output, in your response, the `plan.md` you would write — a frontmatter block
with `topic: token-bucket`, then, per slice, the concrete file-level steps
(naming the files to touch) and the acceptance tests that prove the slice. Do
not write files; just output the plan.

```markdown structure.md
---
topic: token-bucket
date: 2026-06-03
phase: structure
approved: true
approved_at: 2026-06-03T00:00:00Z
revision: 0
---

# Structure: token-bucket

### Slice 1: Per-key bucket store
Goal: a token-bucket store keyed by API key, in-process.
Layers: src/limit/bucket.js (new).
Verification: unit test consumes and refills a bucket.

### Slice 2: Enforce limit in the request path
Goal: handler rejects over-limit requests with a 429 + Retry-After.
Layers: src/api/handler.js, src/api/respond.js.
Verification: integration test sends N+1 requests and asserts the 429.
```
