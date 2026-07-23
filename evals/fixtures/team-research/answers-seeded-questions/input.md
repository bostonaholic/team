---
agent: team-research
tier: periodic
deps:
  - skills/team-research/**
  - skills/researching-codebases/**
  - skills/finding-files/**
  - agents/researcher.md
---

# Seeded-state task: research a codebase against seeded questions.md

You are running the RESEARCH phase against a seeded `questions.md`. The eval
harness writes the fenced block below to
`docs/plans/2026-06-03-token-bucket/questions.md` in your working directory
before you start. Read that file, answer its questions against the working-dir
codebase, and produce `research.md`-style findings in your response.

The load-bearing property: `research.md` answers the seeded questions and
reuses the topic slug `token-bucket` verbatim from the seeded
`questions.md` frontmatter — never improvised, never combined with a ticket id.

Output, in your response, the `research.md` you would write — including a
frontmatter block with `topic: token-bucket` and findings that address each
seeded question. Reference the file `src/api/handler.js` in at least one
finding.

```markdown questions.md
---
topic: token-bucket
date: 2026-06-03
phase: questions
---

# Research questions

1. How are inbound HTTP requests dispatched to handlers in this codebase?
2. Where, if anywhere, is a per-client identifier extracted from a request?
3. How are HTTP responses constructed and what headers are set today?
```
