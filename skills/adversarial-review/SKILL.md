---
name: adversarial-review
description: Generator-evaluator separation and review methodology — loaded by review agents to enforce fresh-context review discipline, Conventional Comments format, and gate verdicts
---

# Adversarial Review

Reviews must be performed by agents with fresh context. The generator (the
agent that wrote the code) must never evaluate its own output. This separation
prevents self-evaluation bias — the tendency to see what you intended to write
rather than what you actually wrote.

## Generator-Evaluator Separation

The cardinal rule: **Don't let the same model grade its own exam.**

- Reviewers MUST have fresh context with no shared conversation history
- Reviewers read the diff and the plan — not the implementation discussion
- Reviewers form their own understanding of intent from artifacts, not from
  the implementer's explanation
- If a reviewer needs clarification, they flag it as an open question — they
  do not ask the implementer

This separation is enforced structurally by dispatching review agents as
independent subagents with no access to the orchestrator's conversation.

## Conventional Comments

All review comments use the Conventional Comments format
(https://conventionalcomments.org). Every comment MUST include a specific
`file:line` reference.

### Comment Types

**issue (blocking):**
Identifies a defect that must be fixed before approval.
```
issue: This query interpolates user input without parameterization.
file: src/api/users.ts:42
```

**suggestion (non-blocking):**
Proposes an improvement. The author may accept or decline.
```
suggestion: Consider extracting this validation into a shared utility.
file: src/handlers/create.ts:18
```

**nitpick (non-blocking):**
Minor style or naming observation. Never blocks approval.
```
nitpick: "data" is too vague — consider "userProfile" to match the domain.
file: src/models/types.ts:7
```

**praise:**
Acknowledges good work. Reinforces positive patterns.
```
praise: Clean separation of side effects from pure logic here.
file: src/services/billing.ts:30-45
```

## Gate Types by Reviewer

| Reviewer | Gate Type | Blocks Ship? |
|----------|-----------|--------------|
| `security-reviewer` | HARD | Yes — critical findings are non-negotiable |
| `verifier` | HARD | Yes — tests must pass, build must succeed |
| `code-reviewer` | SOFT | User decides — presented with findings |
| `ux-reviewer` | SOFT | User decides — presented with findings |
| `technical-writer` | ADVISORY | No — findings recorded, pipeline proceeds |

## Verdict Criteria

### Security Reviewer

- **PASS:** No CRITICAL findings. HIGH/MEDIUM/LOW findings are reported but
  do not block.
- **FAIL:** Any CRITICAL finding. The pipeline MUST loop back to IMPLEMENT.
  No override.

### Verifier

- **PASS:** All detected checks (format, lint, typecheck, build, test) pass.
- **FAIL:** Any check fails. The pipeline loops back to IMPLEMENT.

### Code Reviewer

- **APPROVE:** All done criteria met, no blocking issues, tests pass.
- **REQUEST CHANGES:** Blocking issues found. User sees the issues and decides
  whether to proceed or fix.
- **COMMENT:** Non-blocking suggestions only. Implementation is correct.

### UX Reviewer

- **APPROVE:** API/UX is intuitive, consistent with existing patterns.
- **REQUEST CHANGES:** Usability issues found. User sees the issues and decides.
- **COMMENT:** Minor ergonomic suggestions.

### Technical Writer

- **PASS:** Documentation is adequate for the changes made.
- **GAPS:** Documentation gaps identified. Recorded for future work.

## Aggregating Verdicts

When multiple reviewers produce verdicts, aggregate them into a single
pipeline gate decision:

1. If ANY hard-gate reviewer fails -> pipeline gate FAILS (loop to IMPLEMENT)
2. If all hard-gate reviewers pass but soft-gate reviewers request changes ->
   pipeline gate is CONDITIONAL (present findings, user decides)
3. If all reviewers pass/approve -> pipeline gate PASSES (proceed to SHIP)

Hard gate failures are never aggregated away. A single CRITICAL security
finding blocks shipping regardless of how many other reviewers approved.
