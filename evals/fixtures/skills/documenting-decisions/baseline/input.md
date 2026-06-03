---
agent: skills/documenting-decisions
tier: periodic
deps:
  - skills/documenting-decisions/**
---

Write the full text of an Architecture Decision Record for the decision to
adopt Postgres over MySQL as the primary datastore. Output the ADR content
directly in your response as Markdown — do not create files or look for an
existing ADR directory. Context to ground it: the team needs rich JSONB
querying and strong transactional guarantees; MySQL was the incumbent.
