---
agent: test-architect
tier: gate
deps:
  - agents/test-architect.md
---

# Author acceptance tests for a discount helper

The slice adds a discount helper. The plan's acceptance contract requires the
tests to cover BOTH branches of the threshold logic. Identify the untested
branch and describe the acceptance test(s) needed to cover it.

```js
// src/pricing/apply-discount.js
export function applyDiscount(total) {
  if (total >= 100) {
    // Branch A: orders of 100 or more get 10% off.
    return total * 0.9;
  }
  // Branch B: orders under 100 are returned unchanged.
  return total;
}
```

The implementer's existing tests only exercise an order of 150 (Branch A).
There is NO test for an order under 100 (Branch B) — the below-threshold
branch is currently uncovered.
