---
agent: team-design
tier: periodic
deps:
  - skills/team-design/**
  - skills/authoring-designs/**
  - agents/design-author.md
---

# Seeded-state task: draft a design against seeded research.md + task.md

You are running the DESIGN phase. The eval harness writes the two fenced blocks
below to `docs/plans/2026-06-03-token-bucket/task.md` and
`docs/plans/2026-06-03-token-bucket/research.md` in your working directory
before you start. Read them and draft a `design.md`-style document in your
response.

The load-bearing properties: the design carries a `## Decisions made` section
recording its self-resolved choices marked as explicit assumptions, and copies
the topic slug `token-bucket` verbatim from the seeded
artifacts.

Output, in your response, the `design.md` you would write — a frontmatter block
with `topic: token-bucket` and the standard sections (Current state, Desired
end state, Decisions made, Out of scope), where `## Decisions made` records at
least two self-resolved choices marked as assumptions with the rejected
alternative. Do not write files; just output
the design.

```markdown task.md
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

```markdown research.md
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
