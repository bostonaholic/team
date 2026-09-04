---
name: conventional-comments
description: 'Defines conventional comments methodology. Load when agents need its procedure.'
user-invocable: false
---

# Conventional Comments

Code, security, and docs reviewers use [Conventional Comments](https://conventionalcomments.org); ux-reviewer uses Working/Broken/Could Improve. Every comment includes a specific `file:line`.

## Comment Style

Address code, not its author; assume competence. Explain why. Reserve `issue:` for correctness, security, or maintainability defects; use `suggestion:`/`nitpick:` for preferences. More than ~10 substantive comments on one change indicates a design problem: propose splitting the change or continuing design discussion outside review.

Prefer “The null case is not handled here” over “You are not handling the null case.” Prefer “I cannot follow this branch—clarify?” over “This does not make sense.”

## Comment Types

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
