---
agent: team-plan
tier: periodic
deps:
  - skills/team/principles/durable-state.md
  - skills/team/principles/focused-work.md
  - skills/team/references/artifacts.md
  - skills/team/playbooks/plan.md
  - skills/team/references/code-standards.md
  - skills/team/references/dependencies.md
  - skills/team-plan/**
  - agents/planner.md
---

# Seeded-state task: expand a structure into a tactical plan

You are running the PLAN phase. The eval harness writes the fenced block below
to `docs/plans/2026-06-03-token-bucket/7-structure.md` in your working
directory before you start. Read it and
produce a `8-plan.md`-style tactical plan in your response.

The load-bearing properties: the plan expands each structure slice into
file-level steps and maps each slice to its acceptance tests, and it copies the
topic slug `token-bucket` verbatim from the seeded structure.

Output, in your response, the `8-plan.md` you would write — a frontmatter block
with `topic: token-bucket`, then, per slice, the concrete file-level steps
(naming the files to touch) and the acceptance tests that prove the slice. Do
not write files; just output the plan.

```markdown 7-structure.md
---
topic: token-bucket
date: 2026-06-03
phase: structure
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

```markdown 1-task.md
---
topic: token-bucket
date: 2026-06-03
phase: task
ticketId: null
---

# Task

Add a per-client request limiter to the public API so one abusive client
cannot exhaust the backend.
```

```markdown 5-research.md
---
topic: token-bucket
date: 2026-06-03
phase: research
---

# Research findings

- Requests are dispatched through `src/api/handler.js`; there is no
  per-client throttling today.
- A client identifier (API key) is already validated in
  `src/api/auth.js:40`.
- Responses are built in `src/api/respond.js`; no `Retry-After` header is
  set anywhere.
```
