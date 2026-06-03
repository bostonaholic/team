---
agent: team-question
tier: periodic
deps:
  - skills/team-question/**
  - agents/questioner.md
---

# Self-contained task: decompose a feature into research-neutral questions

Apply the team-question (QUESTION) phase to the feature description below. The
Question phase splits intent (`task.md`) from neutral research questions
(`questions.md`). The load-bearing property: the research questions must be
phrased WITHOUT leaking the feature framing — a researcher who reads only the
questions should have no idea what feature is being built.

Feature description:

> Add a rate limiter to the public API so abusive clients can't exhaust the
> backend. We want per-API-key limits, a 429 response with a Retry-After
> header, and the limit configurable per plan tier.

Emit, in your response text, the list of neutral research questions you would
write into `questions.md` (one per line, each ending in a question mark). Phrase
them so they ask about the current codebase — how requests are handled, where
API keys are validated, how responses are built — WITHOUT naming "rate
limiting", "429", "Retry-After", or "plan tier". Do not write files; just
output the questions.
