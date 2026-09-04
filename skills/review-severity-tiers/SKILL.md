---
name: review-severity-tiers
description: 'Defines review severity tiers methodology. Load when agents need its procedure.'
user-invocable: false
---

# Review Severity Tiers

## Gate Types by Reviewer

| Reviewer | Gate Type | Blocks Ship? |
|----------|-----------|--------------|
| `security-reviewer` | HARD | Yes — critical or high findings are non-negotiable |
| `verifier` | HARD | Yes — tests must pass, build must succeed |
| `code-reviewer` | HARD | Yes — blocking issues must be resolved |
| `ux-reviewer` | AUTO-FIX | REQUEST CHANGES is auto-applied in the loop (a *major*). Only COMMENT notes may reach you |
| `technical-writer` | ADVISORY | No — findings recorded, pipeline proceeds |

## Severity Tiers and the Auto-Fix Boundary

This table maps Conventional Comments, security severities, and reviewer
verdicts to one orchestrator action. Every finding has one tier.

| Tier | Findings in this tier | Action |
|------|-----------------------|--------|
| **Blocking** | `issue (blocking)`, code-reviewer REQUEST CHANGES, security CRITICAL/HIGH, any verifier failure | Auto-fixed in the loop. **Never** surfaced to the user. |
| **Major** | ux-reviewer REQUEST CHANGES | Auto-fixed in the loop. **Never** surfaced to the user. |
| **Minor and below** | `suggestion (non-blocking)`, `nitpick (non-blocking)`, security MEDIUM, security LOW, technical-writer GAPS (REQUIRED and RECOMMENDED alike), any COMMENT-level note | Recorded in the PR body's `## Review notes` — never presented mid-run. |

**A non-blocking finding never costs a round.** Each auto-fix reruns the
implementer and all five reviewers. Blocking/Major are fixed autonomously;
Minor reaches the human in PR review, regardless of importance.
The human decides what to build and what to ship; the middle runs autonomously (`principle-human-owns-the-ends`).

- CRITICAL/HIGH are hard gates; MEDIUM/LOW do not block.
- Technical-writer REQUIRED and RECOMMENDED are both Minor because its gate is
  ADVISORY.

**No consult:** never present findings mid-run. Loop Blocking/Major until zero;
write Minor-and-below to PR `## Review notes`, tagged by reviewer.

## Aggregating Verdicts

1. Any Blocking/Major: FAIL; return to IMPLEMENT with no consult.
2. Only Minor-and-below: PASS with PR `## Review notes`; proceed to SHIP.
3. No findings: PASS; proceed to SHIP.

Loop until Blocking/Major are zero. No round limit or consultation ends it.
Never aggregate a Blocking/Major away; one CRITICAL blocks shipping.
