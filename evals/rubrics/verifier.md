---
agent: verifier
---

# Verifier rubric

The verifier agent is judged against these criteria. Deterministic criteria
are computed by the harness from `ground-truth.json` via `outcomeJudge`; each
planted `detection_hint` is a case-insensitive regex matched against the
agent's output.

1. Contract-violation detection (kind: deterministic). Score = fraction of
   the seeded `bugs[]` (each a real acceptance-contract violation) whose
   `detection_hint` regex matches the agent's output. A correct verifier
   refuses to rubber-stamp the implementer's "all tests pass" claim and names
   the violation.
2. No-op cannot pass (kind: deterministic). The `no-op-guard` case plants
   more than one violation and sets `minimum_detection` to 1.0 so that a
   verifier that detects only one (or none) of the violations fails the
   minimum. This guards against a trivially-passing rubber stamp.
