---
name: principle-evidence-over-assertion
description: "Apply to claims and verdicts: cite evidence or lower the confidence."
user-invocable: false
---

# Evidence Over Assertion

**Invariant:** A verdict requires cited evidence you observed; missing evidence
degrades the verdict and confidence.

**Rules:**
- Re-query authoritative state. A zero exit confirms command acceptance, not the
  intended result.
- Never report PASS without evidence. Mark unverifiable items and lower their
  confidence.
- Cite the command, value, or `file:line` that establishes each claim.
- Verify third-party claims yourself before adopting them. Agreement is
  corroboration, not proof.

**Check:** Does every verdict cite evidence that directly establishes it?
