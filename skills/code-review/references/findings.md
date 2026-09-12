# Review Findings

Every review surface — code, security, design, documentation, and comment
review — shares one finding format and one severity interpretation. Producers
read this file to aggregate verdicts; reviewers read it to format findings.

## Finding Format

Code, security, and docs reviewers use [Conventional
Comments](https://conventionalcomments.org); `ux-reviewer` uses
Working/Broken/Could Improve. Every comment includes a specific `file:line`.

### Comment Style

Address code, not its author; assume competence. Explain why. Reserve `issue:`
for correctness, security, or maintainability defects; use `suggestion:`/
`nitpick:` for preferences. More than ~10 substantive comments on one change
indicates a design problem: propose splitting the change or continuing design
discussion outside review.

Prefer “The null case is not handled here” over “You are not handling the null
case.” Prefer “I cannot follow this branch—clarify?” over “This does not make
sense.”

### Comment Types

Every body begins with its label and decoration inside literal `**...**`.

**issue (blocking):** must be fixed before approval.

```text
**issue (blocking):** This query interpolates user input without parameterization.
file: src/api/users.ts:42
```

**suggestion (non-blocking):** author may accept or decline.

```text
**suggestion (non-blocking):** Consider extracting this validation into a shared utility.
file: src/handlers/create.ts:18
```

**nitpick (non-blocking):** minor style/naming; never blocks.

```text
**nitpick (non-blocking):** "data" is too vague — consider "userProfile" to match the domain.
file: src/models/types.ts:7
```

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
The human decides what to build and what to ship; the middle runs autonomously
([human control rules](../team/principles/human-control.md)).

- `agents/security-reviewer.md` and the code reviewer brief agree: CRITICAL/HIGH
  are hard gates; MEDIUM/LOW do not block.
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
