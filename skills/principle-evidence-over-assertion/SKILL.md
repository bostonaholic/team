---
name: principle-evidence-over-assertion
description: 'Defines evidence over assertion. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# Evidence Over Assertion

A claim earns its verdict only with cited evidence: a command actually
run, a file:line actually read, an authoritative value actually
re-queried. When the evidence cannot be collected, the verdict degrades
and says so — it is never rounded up.

**Why:** A confident wrong answer is the most expensive kind. Assertions
compound: one unverified claim adopted into a report becomes the evidence
for the next wrong decision.

**Pattern:**
- Verify by re-querying, never by memory. A zero exit means the mutation
  was accepted, not that the change landed — re-read the authoritative
  value and confirm the property you meant to establish.
- No PASS without cited evidence; an unverifiable item is reported as
  unverifiable at its degraded confidence.
- Ground every verdict in a load-bearing fact you observed yourself, and
  name it. A third party's claim (a comment, a vendor finding) is never
  the sole evidence — verify it at a concrete file:line before adopting.
- Agreement is corroborating signal, never proof. Another reviewer's or
  model's concurrence does not substitute for your own check.
