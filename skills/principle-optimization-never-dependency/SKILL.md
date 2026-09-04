---
name: principle-optimization-never-dependency
description: 'Keeps optional enhancements off the correctness path. Apply when adding subagents, second-vendor passes, caches, or uploads.'
user-invocable: false
---

# Optimization, Never a Dependency

Treat nested sub-agents, second-vendor passes, screenshot uploads, and couriers as optional enhancements: Skip loudly on any failure, fall back inline, and preserve the outcome.

- On absence, error, or silence, perform the work inline with available tools and continue; never fail solely because the enhancement failed.
- Never soften a verdict because an optional pass did not run; record the skip and reason under `principle-skip-loudly`.
- Never let enhancements block, retry-loop, or prompt the user.
- Discard malformed enhancement results and use the fallback; never repair and trust them.
- Apply this rule only to enhancements; guarantees fail closed under `principle-fail-closed`.
