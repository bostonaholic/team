---
name: principle-optimization-never-dependency
description: 'Defines optimization never dependency. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# Optimization, Never a Dependency

An enhancement path — a nested sub-agent, a second-vendor pass, a
screenshot upload, a courier — improves the work when it runs and must
cost nothing when it cannot. Skip loudly on any failure, fall back
inline, and never let the miss change the outcome.

**Why:** Wiring an optional capability as a dependency converts its
absence into an outage. The inline fallback is the contract that keeps
the enhancement optional.

**Pattern:**
- On absence, error, or silence: do the work yourself inline with the
  tools you hold, and proceed. Never stall, and never report failure
  solely because the enhancement was unavailable.
- Never soften a verdict because an optional pass did not run. Record the
  skip and its reason where the report format puts it
  (`principle-skip-loudly`).
- The enhancement never blocks, retry-loops, or prompts the user; its
  failure is a line in the report, not a stop.
- A malformed enhancement result is discarded and the fallback used —
  never patched up and trusted.
- Classify first: this rule is for enhancements. A step that carries a
  guarantee fails closed instead — see
  `principle-fail-closed`.
