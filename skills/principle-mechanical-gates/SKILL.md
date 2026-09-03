---
name: principle-mechanical-gates
description: "Apply to mandatory rules: enforce them with the cheapest deterministic check."
user-invocable: false
---

# Mechanical Gates

**Invariant:** Any rule that must hold is enforced by a deterministic check,
not model compliance.

**Rules:**
- Put each check at the cheapest, most deterministic layer that can detect the
  violation; do not use a judge where a parser or regex suffices.
- Reject slow, flaky, or paid checks when a lower layer can establish the same
  contract.
- Fail early and loudly; never mask the error.
- Prefer preventing a violation over observing it, and checking the artifact
  over checking intent.
- A check dependent on model restraint is not enforcement.

**Check:** Would this rule still hold if the model ignored its prose instruction?
