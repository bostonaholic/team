---
name: principle-fail-closed
description: 'Treats unknown guarantees as failures. Apply when a safety, validity, or completion gate cannot be evaluated.'
user-invocable: false
---

# Fail Closed

Reject any guarantee you cannot evaluate: Unknown counts as unsupported, a missing verdict counts as not passed, and inconclusive refutation keeps the finding.

- Never advance on a missing or unparseable verdict; retry once with the error, then halt loudly.
- Treat a failed capability check as unavailable and take the fallback path.
- Let refutation remove only confirmed false positives; never soften severity on an uncertain reply.
- Resolve ambiguous irreversible instructions safely, such as watching a draft instead of publishing it.
- Apply this rule to guarantees; degrade failed enhancements loudly under `principle-optimization-never-dependency`.
