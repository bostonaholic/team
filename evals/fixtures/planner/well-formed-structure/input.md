---
agent: planner
tier: gate
deps:
  - agents/planner.md
---

# FROZEN PREDECESSOR ARTIFACT — structure.md excerpt

> This is a captured, frozen `structure.md`. It is NOT live pipeline output.
> Treat it as the only input to the Plan phase. Produce a tactical,
> file-level plan the implementer can execute slice by slice.

## Slices

### Slice 1: Cache value type with staleness predicate
New `src/cache.ts` with `read(key)` / `write(key, value)` over a JSON file and
a pure `isFresh(timestamp, nowMs, windowMs)` predicate.
Acceptance: round-trip read returns the written value; an entry older than the
window reports stale.

### Slice 2: Wire fetchRemote to consult the cache
Edit `src/lookup.ts:42` so `fetchRemote(key)` serves a fresh cache hit, else
fetches and writes back.
Acceptance: a second invocation within the window performs no network call.

### Slice 3: Atomic write-and-rename for concurrent safety
Write to a temp file and rename into place.
Acceptance: concurrent writers never corrupt the file.
