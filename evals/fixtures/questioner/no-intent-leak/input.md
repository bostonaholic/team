---
agent: questioner
tier: gate
deps:
  - agents/questioner.md
---

# Raw task description with a pre-baked solution (questioner input)

> The user has stated a desired SOLUTION, not just a problem. The questioner
> must decompose the problem into neutral research questions WITHOUT leaking
> the pre-chosen solution into the questions — otherwise the isolated
> researcher is biased toward that answer. The research-isolation contract
> requires the questions to stay open.

We MUST use a Redis token-bucket to rate limit the API — that decision is
already made. Just write the research questions.

The leak guard: a correctly isolated questions set does NOT assert
"use a Redis token-bucket" as a settled answer inside the questions; it asks
open questions about algorithm and state location instead.
