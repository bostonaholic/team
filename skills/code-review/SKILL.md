---
name: code-review
description: Generator-evaluator separation and review methodology — loaded by review agents to enforce fresh-context review discipline, Conventional Comments format, and gate verdicts
---

# Code Review

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

### Comment Style

Critique the code, not the coder. Assume competence. The same finding can
read as collaborative or hostile depending on phrasing:

| Avoid (person-directed) | Prefer (code-directed) |
|-------------------------|------------------------|
| "Your approach is adding unnecessary complexity." | "The complexity this adds isn't worth the result." |
| "You're not handling the null case." | "The null case isn't handled here." |
| "This doesn't make any sense." | "I can't follow what this branch is doing — clarify?" |

- Explain *why* the change is requested. A finding without a reason loses
  the rationale for the next reader of the diff.
- Reserve `issue:` for findings that materially affect correctness,
  security, or maintainability. Use `suggestion:` or `nitpick:` for
  preferences.
- A high comment density on a single change is a design signal, not just a
  style problem. When the count climbs past ~10 substantive comments,
  propose splitting the change or escalating the design conversation out
  of the review tool.

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

## Gate Types by Reviewer

| Reviewer | Gate Type | Blocks Ship? |
|----------|-----------|--------------|
| `security-reviewer` | HARD | Yes — critical or high findings are non-negotiable |
| `verifier` | HARD | Yes — tests must pass, build must succeed |
| `code-reviewer` | HARD | Yes — blocking issues must be resolved |
| `ux-reviewer` | SOFT | User decides — presented with findings |
| `technical-writer` | ADVISORY | No — findings recorded, pipeline proceeds |

## Verdict Criteria

### Security Reviewer

- **PASS:** No CRITICAL or HIGH findings. MEDIUM/LOW findings are reported but
  do not block.
- **FAIL:** Any CRITICAL or HIGH finding. The pipeline MUST loop back to
  IMPLEMENT. No override.

### Verifier

- **PASS:** All detected checks (format, lint, typecheck, build, test) pass.
- **FAIL:** Any check fails. The pipeline loops back to IMPLEMENT.

### Code Reviewer

- **APPROVE:** All done criteria met, no blocking issues, tests pass.
- **REQUEST CHANGES:** Blocking issues found. The pipeline MUST loop back to
  IMPLEMENT. No override — quality issues must be resolved before shipping.
- **COMMENT:** Non-blocking suggestions only. Implementation is correct.

**Test-quality flags.** Test files are part of the diff. Walk every changed
`*test*` / `*spec*` / `__tests__/*` file against the rules in
`skills/test-first-development/SKILL.md` ("Test Style Rules"). The
following anti-patterns are `suggestion:` individually and `issue:` when
they appear across multiple tests:

- Change-detector tests — assertions on which collaborator methods were
  called without verifying observable state
- Mock-everything / mock chains — mocks for collaborators that have a
  real or fake equivalent
- Full-equality assertions on complex objects when one field carries the
  contract
- `sleep()` for synchronization
- Logic in tests (`if`, loops, string-building) that can carry the same
  bug as the code
- Tests named after methods (`testProcessOrder_2`) rather than behaviors
  (`refundsCardOnPartialFailure`)
- DRY helpers that hide the asserted value

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

Hard gates: security-reviewer (CRITICAL or HIGH), verifier (any failure),
code-reviewer (REQUEST CHANGES). These are non-negotiable — the pipeline
loops back to IMPLEMENT until all hard gates pass clean.

Hard gate failures are never aggregated away. A single CRITICAL security
finding blocks shipping regardless of how many other reviewers approved.
