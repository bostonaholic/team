---
name: review-severity-tiers
description: The authoritative severity-tier map for aggregating reviewer verdicts — gate types by reviewer, the Blocking/Major/Minor tiers with the auto-fix boundary, the consult guard, and the 5-round cap. Load when aggregating review findings, deciding a pipeline gate, or sorting a finding into a severity tier.
user-invocable: false
---

# Review Severity Tiers

## Gate Types by Reviewer

| Reviewer | Gate Type | Blocks Ship? |
|----------|-----------|--------------|
| `security-reviewer` | HARD | Yes — critical or high findings are non-negotiable |
| `verifier` | HARD | Yes — tests must pass, build must succeed |
| `code-reviewer` | HARD | Yes — blocking issues must be resolved |
| `ux-reviewer` | AUTO-FIX | REQUEST CHANGES is auto-applied in the loop (a *major*); only COMMENT notes may reach you |
| `technical-writer` | ADVISORY | No — findings recorded, pipeline proceeds |

## Severity Tiers and the Auto-Fix Boundary

There is no single "blocker/critical/major/minor" scale — reviewers raise
findings in three different vocabularies (Conventional Comments
`issue`/`suggestion`/`nitpick`, security CRITICAL/HIGH/MEDIUM/LOW, and the
APPROVE/REQUEST CHANGES/COMMENT verdict). This table is the authoritative map
from any of those onto the action the orchestrator takes. Every finding lands
in exactly one tier.

| Tier | Findings in this tier | Action |
|------|-----------------------|--------|
| **Blocking** | `issue (blocking)`, code-reviewer REQUEST CHANGES, security CRITICAL/HIGH, any verifier failure | Auto-fixed in the loop. **Never** surfaced to the user. |
| **Major** | `suggestion (non-blocking)`, security MEDIUM, ux-reviewer REQUEST CHANGES | Auto-fixed in the loop. **Never** surfaced to the user. |
| **Minor and below** | `nitpick (non-blocking)`, security LOW, technical-writer GAPS, any COMMENT-level note | Surfaced to the user for a decision — but **only after** Blocking and Major are clean. |

**The consult guard (non-negotiable).** While *any* Blocking or Major finding
remains unresolved, the orchestrator MUST NOT present findings to the user or
ask which ones to address. It loops the implementer automatically. The user is
consulted exclusively for the remaining Minor-and-below findings, and only once the loop
has driven Blocking and Major to zero. A consult prompt that lists a blocking
or major finding is a defect.

## Aggregating Verdicts

When multiple reviewers produce verdicts, aggregate them into a single
pipeline gate decision:

1. If ANY Blocking or Major finding exists -> pipeline gate FAILS — loop back
   to IMPLEMENT automatically, with no consult.
2. If only Minor-and-below findings remain -> pipeline gate is CONDITIONAL:
   present them to the user, who decides. If none remain, proceed to
   SHIP.
3. If no findings remain -> pipeline gate PASSES (proceed to SHIP).

The loop continues until Blocking and Major are zero, capped at 5 rounds; at
the cap, escalate with the full unresolved-findings summary.

Blocking and Major failures are never aggregated away and never surfaced for
triage. A single CRITICAL security finding blocks shipping regardless of how
many other reviewers approved.
