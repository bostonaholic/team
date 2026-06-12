---
agent: questioner
tier: gate
deps:
  - agents/questioner.md
---

# Raw task description (questioner input)

> This is a raw, unstructured task description handed to the questioner. The
> questioner decomposes it into a task statement plus a set of research
> questions for the isolated researcher.

We want to add rate limiting to our public HTTP API so that a single client
cannot overwhelm the service. We are not sure what algorithm to use, where the
limit state should live, or how to communicate a rejection back to the client.
Produce the questions a researcher would need to answer to scope this.
