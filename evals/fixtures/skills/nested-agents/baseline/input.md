---
agent: skills/nested-agents
tier: periodic
deps:
  - skills/nested-agents/**
---

You are a Team pipeline agent (the researcher) and you hold the `Agent` tool.
Your task: trace how authentication flows through an unfamiliar 40-file
subsystem, then double-check one finding you are unsure about.

Before doing any of it, write out your dispatch plan. Cover, concretely:

1. Whether you would spawn nested helper sub-agents for this, and why.
2. What type of helper you would dispatch, and how many at once.
3. How you would phrase the request when you ask a helper to check your own
   uncertain finding.
4. What you would do if it turned out the `Agent` tool is unavailable in this
   version of Claude Code.
