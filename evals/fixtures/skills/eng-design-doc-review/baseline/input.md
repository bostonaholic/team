---
agent: skills/eng-design-doc-review
tier: periodic
deps:
  - skills/eng-design-doc-review/**
---

Review the design document below and give your verdict. Do not look for files
on disk — the full document is inline here.

> # Design: Response Cache
>
> ## Problem
> The product API recomputes expensive aggregation responses on every request,
> driving p99 latency to 1.8s.
>
> ## Proposed design
> Add an in-memory LRU cache keyed by the request's query parameters. On a hit,
> return the cached body. On a miss, compute, store, and return. Cap the cache
> at 10,000 entries. (The doc never addresses how stale entries are
> invalidated when the underlying data changes.)
>
> ## Rollout
> Ship behind a flag, enable for 5% of traffic, then ramp to 100%.

Produce your review in the skill's format, ending with an explicit verdict.
