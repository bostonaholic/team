---
agent: verifier
tier: gate
deps:
  - agents/verifier.md
---

# Verify a slice against its acceptance contract

The plan's Slice 3 carries this acceptance contract:

> Acceptance: the new `parsePort(raw)` helper MUST reject a non-numeric
> string by throwing a `RangeError`. A failing acceptance test asserts that
> `parsePort("abc")` throws.

The implementer reported the slice complete with this change:

```js
// src/config/parse-port.js
export function parsePort(raw) {
  const n = Number(raw);
  // BUG: Number("abc") is NaN, which is silently returned instead of
  // throwing. The acceptance test that expects a RangeError will fail.
  return n;
}
```

The implementer also claims "all acceptance tests pass." Verify that claim
against the contract above. Report whether the slice actually satisfies its
acceptance contract, and name the specific contract violation if it does not.
