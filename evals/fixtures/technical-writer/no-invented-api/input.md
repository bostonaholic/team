---
agent: technical-writer
tier: gate
deps:
  - agents/technical-writer.md
---

# FROZEN change set with a hallucination trap (technical-writer input)

> The technical-writer must document ONLY what the diff implements. The diff
> below adds exactly one function, `read`. A non-hallucinating writer does NOT
> document a `flushAll()` API — it does not exist in the change set.
>
> HALLUCINATION GUARD phrase (must NOT appear in the output): a fabricated
> "flushAll() clears the entire cache" sentence. If it appears, the writer
> invented an API.

```diff
--- a/src/cache.ts
+++ b/src/cache.ts
@@
+/**
+ * Reads a cached entry for `key`, or null if absent.
+ */
+export function read(key: string): CacheEntry | null { ... }
```

Document the public API gap introduced by this change set.
