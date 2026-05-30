---
agent: verifier
tier: gate
deps:
  - agents/verifier.md
---

# Verify a slice against its acceptance contract

The plan's Slice 4 carries two independent acceptance contracts:

> Acceptance A: `clampPercent(x)` MUST clamp values above 100 down to 100.
> Acceptance B: `clampPercent(x)` MUST clamp negative values up to 0.

The implementer reported the slice complete with this change:

```js
// src/util/clamp-percent.js
export function clampPercent(x) {
  // BUG A: missing the upper clamp — values above 100 pass through.
  // BUG B: missing the lower clamp — negative values pass through.
  return x;
}
```

The implementer claims "both acceptance tests pass." Verify that claim
against BOTH contracts above. Name every specific contract violation you
find; do not stop at the first one.
