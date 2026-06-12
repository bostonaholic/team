---
agent: structure-planner
tier: gate
deps:
  - agents/structure-planner.md
---

# FROZEN PREDECESSOR ARTIFACT — design.md excerpt

> This is a captured, frozen `design.md`. It is NOT live pipeline output.
> Treat it as the only input to the Structure phase. Break it into vertical,
> independently testable slices.

## Approach

Add a persistent, cross-invocation lookup cache. On each `fetchRemote(key)`
call (`src/lookup.ts:42`) read a JSON cache file under the user's home
directory; serve entries newer than the one-hour staleness window, otherwise
fetch and write back atomically.

## Components

1. A `Cache` value type (read/write a keyed JSON file) — new
   `src/cache.ts`.
2. A staleness predicate (timestamp + window) — part of `src/cache.ts`.
3. Wiring `fetchRemote` to consult the cache — edit `src/lookup.ts:42`.
4. Atomic write-and-rename to survive concurrent invocations.

## Acceptance signals

- A second invocation within the window does not call the network.
- An entry older than the window triggers a refetch.
- Concurrent writers never corrupt the file.
