---
name: review-severity-tiers
description: Map reviewer findings to Blocking, Major, or Minor pipeline actions. Loaded when aggregating reviews.
user-invocable: false
---

# Review Severity Tiers

## Gate Types by Reviewer

| Reviewer | Gate | Blocking result |
|---|---|---|
| `security-reviewer` | HARD | CRITICAL or HIGH |
| `verifier` | HARD | any failed check |
| `code-reviewer` | HARD | blocking issue / REQUEST CHANGES |
| `ux-reviewer` | AUTO-FIX | REQUEST CHANGES (Major) |
| `technical-writer` | ADVISORY | none |

## Severity Tiers and the Auto-Fix Boundary

This is the sole mapping from reviewer vocabulary to orchestrator action.

| Tier | Findings in this tier | Action |
|---|---|---|
| **Blocking** | `issue (blocking)`, code-reviewer REQUEST CHANGES, security CRITICAL/HIGH, any verifier failure | Auto-fixed in the loop. Never surfaced to the user. |
| **Major** | ux-reviewer REQUEST CHANGES | Auto-fixed in the loop. Never surfaced to the user. |
| **Minor and below** | `suggestion (non-blocking)`, `nitpick (non-blocking)`, security MEDIUM, security LOW, technical-writer GAPS (REQUIRED and RECOMMENDED alike), any COMMENT-level note | Record in `9-implementation.md` under `## Review notes`; never present mid-run. |

Each finding maps to exactly one row. A non-blocking finding never costs a
review round. MEDIUM/LOW security findings do not block. Technical-writer
REQUIRED and RECOMMENDED findings are both advisory. Security's boundary must
agree with `skills/reviewing-code/SKILL.md`.

**No-consult rule:** never present findings to the user mid-run. Blocking and
Major findings return to the implementer automatically. Minor-and-below wait
for human PR review (`skills/principle-human-owns-the-ends/SKILL.md`).

## Aggregating Verdicts

1. Any Blocking or Major finding: FAIL and loop to IMPLEMENT without consult.
2. Only Minor-and-below findings: PASS with notes; write the current-head
   `9-implementation.md` record and return to the coordinator.
3. No findings: PASS; write the current-head `9-implementation.md` record
   without Review notes and return to the coordinator.

Continue until Blocking and Major are both zero. No round cap or user consult
ends the loop. Never aggregate away a Blocking or Major finding.
