---
name: conventional-comments
description: Format code, security, and documentation review findings as Conventional Comments.
user-invocable: false
---

# Conventional Comments

## Input

A code, security, or documentation finding. UX reports use their own
Working/Broken/Could Improve format.

## Required format

- Critique code, not its author.
- State the consequence or reason.
- Include a specific `file:line`.
- Use `issue:` only for correctness, security, or maintainability defects;
  use `suggestion:` or `nitpick:` for preferences.
- Above about 10 substantive findings, recommend splitting the change or
  revisiting its design.

Every body starts with one bold label:

```
**issue (blocking):** This query interpolates user input.
file: src/api/users.ts:42

**suggestion (non-blocking):** Extract this shared validation.
file: src/handlers/create.ts:18

**nitpick (non-blocking):** Rename "data" to "userProfile".
file: src/models/types.ts:7
```

## Done

Each finding is code-directed, justified, correctly labeled, and line-cited.
