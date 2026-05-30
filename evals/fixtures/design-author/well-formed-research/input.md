---
agent: design-author
tier: gate
deps:
  - agents/design-author.md
---

# FROZEN PREDECESSOR ARTIFACT — research.md excerpt

> This is a captured, frozen `research.md`. It is NOT live pipeline output.
> Treat it as the only input to the Design phase.

## Question under design

How should a CLI tool cache the results of expensive network lookups so
that repeated invocations within a short window avoid redundant calls?

## Findings (with file:line evidence)

1. The lookup is performed in `src/lookup.ts:42` via `fetchRemote(key)`; it
   has no memoization and is called once per CLI invocation.
2. Each invocation spawns a fresh process, so any in-memory cache is lost
   between runs (`src/cli.ts:11` — `main()` exits after one lookup).
3. The project already writes a config file at `~/.toolrc` (`src/config.ts:8`),
   establishing a precedent for a user-home dotfile location.
4. Lookup results are small JSON blobs (< 2 KB) keyed by a single string.
5. Staleness tolerance: the upstream data changes at most hourly per the
   API docs referenced in `docs/api.md:30`.

## Constraints surfaced

- No external cache service is available; must be self-contained.
- The cache must survive across separate process invocations.
- Entries older than the staleness window must not be served.
