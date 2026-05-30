---
agent: technical-writer
tier: gate
deps:
  - agents/technical-writer.md
---

# FROZEN change set (technical-writer input)

> This is a frozen diff for a merged change. The technical-writer identifies
> user-facing documentation gaps grounded ONLY in what the code does. It must
> not invent APIs the diff does not implement.

```diff
--- a/src/cache.ts
+++ b/src/cache.ts
@@
+/**
+ * Reads a cached entry for `key`, or null if absent.
+ */
+export function read(key: string): CacheEntry | null { ... }
+
+/**
+ * Writes `value` under `key`, stamping the current time.
+ */
+export function write(key: string, value: string): void { ... }
+
+// NOTE: a new public env var TOOL_CACHE_TTL_MS overrides the default
+// one-hour staleness window. It is read at module load.
```

The README currently documents none of `read`, `write`, or the new
`TOOL_CACHE_TTL_MS` environment variable. Identify the documentation gaps a
reader of the public API would hit.
