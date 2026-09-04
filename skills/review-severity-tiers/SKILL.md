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

There is no single "blocker/critical/major/minor" scale — reviewers raise
findings in three different vocabularies (Conventional Comments
`issue`/`suggestion`/`nitpick`, security CRITICAL/HIGH/MEDIUM/LOW, and the
APPROVE/REQUEST CHANGES/COMMENT verdict). This table is the authoritative map
from any of those onto the action the orchestrator takes. Every finding lands
in exactly one tier.

| Tier | Findings in this tier | Action |
|------|-----------------------|--------|
| **Blocking** | `issue (blocking)`, code-reviewer REQUEST CHANGES, security CRITICAL/HIGH, any verifier failure | Auto-fixed in the loop. **Never** surfaced to the user. |
| **Major** | ux-reviewer REQUEST CHANGES | Auto-fixed in the loop. **Never** surfaced to the user. |
| **Minor and below** | `suggestion (non-blocking)`, `nitpick (non-blocking)`, security MEDIUM, security LOW, technical-writer GAPS (REQUIRED and RECOMMENDED alike), any COMMENT-level note | Recorded in the PR body's `## Review notes` — never presented mid-run. |

**A finding that calls itself non-blocking never costs a round.** Every
auto-fix tier triggers a complete re-review: the implementer runs, then all
five reviewers run again from scratch. So each tier assignment is a bet that
the finding is worth that price. `suggestion (non-blocking)` and security
MEDIUM are not. Both say in their own label that the work can ship without
them, and prose review yields some of both on nearly every pass — so pricing
them at a full round means the loop ends only when five independent reviewers
return zero non-blocking findings, which is not a reachable state. Nothing
counts the rounds down for you, so a loop priced that way does not end at
all.

The tier boundary is therefore **not** a judgment about whether a finding
matters. A security MEDIUM can matter a great deal. It is a judgment about
who acts on it: Blocking and Major are fixed by the loop with no human in
sight, and everything below reaches the human at PR review, which is the
checkpoint this pipeline already designates. Minor is not a wastebasket. It
is the human's queue.
The human decides what to build and what to ship; the middle runs autonomously (`principle-human-owns-the-ends`).

Two consequences worth stating, because both have been read the other way:

- **`security-reviewer`'s own instructions agree with this table.**
  `agents/security-reviewer.md` and `skills/reviewing-code/SKILL.md` both say
  CRITICAL and HIGH are hard gates while MEDIUM and LOW do not block. That is
  correct, and it is why the reviewer reports MEDIUMs freely. A table that
  auto-fixed them would silently convert candid reporting into rounds.
- **`technical-writer` REQUIRED is Minor, like RECOMMENDED.** That reviewer's
  gate type is ADVISORY (above). REQUIRED and RECOMMENDED describe how badly
  the *docs* need the change, not what the *pipeline* does about it. Neither
  loops.

**The no-consult rule (non-negotiable).** Findings are never presented to the
user mid-run. Blocking and Major findings loop the implementer automatically
until they are zero. Minor-and-below findings defer to the PR body's
`## Review notes` (tagged by source reviewer) for the human's PR review. A
mid-run prompt that lists any finding is a defect.

## Aggregating Verdicts

When multiple reviewers produce verdicts, aggregate them into a single
pipeline gate decision:

1. If ANY Blocking or Major finding exists -> pipeline gate FAILS — loop back
   to IMPLEMENT automatically, with no consult.
2. If only Minor-and-below findings remain -> pipeline gate PASSES with
   notes: record them for the PR body's `## Review notes` and proceed to
   SHIP.
3. If no findings remain -> pipeline gate PASSES (proceed to SHIP).

The loop continues until Blocking and Major are zero. Nothing else ends it:
no round count, and no consultation with the user.

Blocking and Major failures are never aggregated away and never surfaced for
triage. A single CRITICAL security finding blocks shipping regardless of how
many other reviewers approved.
