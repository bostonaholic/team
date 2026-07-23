---
name: conventional-comments
description: The Conventional Comments format for review findings — label and decoration syntax, code-directed comment style, and the issue/suggestion/nitpick comment types with literal examples. Load when writing, formatting, or labeling review comments, PR feedback, or reviewer findings.
user-invocable: false
---

# Conventional Comments

All review comments use the Conventional Comments format
(https://conventionalcomments.org). Every comment MUST include a specific
`file:line` reference.

## Comment Style

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

## Comment Types

Every comment body MUST begin with the label and decoration wrapped in
`**...**` so GitHub renders it bold. Copy the format in the examples below
literally — including the asterisks — into the comment body you emit.

**issue (blocking):**
Identifies a defect that must be fixed before approval.
```
**issue (blocking):** This query interpolates user input without parameterization.
file: src/api/users.ts:42
```

**suggestion (non-blocking):**
Proposes an improvement. The author may accept or decline.
```
**suggestion (non-blocking):** Consider extracting this validation into a shared utility.
file: src/handlers/create.ts:18
```

**nitpick (non-blocking):**
Minor style or naming observation. Never blocks approval.
```
**nitpick (non-blocking):** "data" is too vague — consider "userProfile" to match the domain.
file: src/models/types.ts:7
```
