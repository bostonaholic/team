# Question-phase artifact templates

## `1-task.md`

```yaml
---
topic: <kebab-case-topic>
date: <YYYY-MM-DD>
phase: task
ticketId: null
---
```

```markdown
# Task: <topic>

## Description
<the user's description verbatim, plus obvious clarifications>

## Stated goal
<one sentence: what the user wants to achieve>

## Inferred goal
<one sentence: what they probably need; may be the same>

## Acceptance signals
- <how the user will know this is done, even if unstated>

## Open assumptions
- <assumptions about scope, users, or environment>
```

## `2-questions.md`

```yaml
---
topic: <kebab-case-topic>
date: <YYYY-MM-DD>
phase: questions
---
```

```markdown
# Research Questions: <topic>

## Codebase context
- Scope: <directory paths, modules, or subsystem labels under investigation>
- Vocabulary: <neutral term definitions used below; no goal>

## Topology
- Where does <component class> live in this codebase?
- What modules consume / produce <relevant data>?

## Conventions
- What test framework, naming convention, and structure does the codebase use?
- What error-handling pattern is used for <relevant subsystem>?

## Constraints
- What types, schemas, or interfaces must changes here honor?
- What existing utilities or abstractions provide <relevant capability>?

## Reference points
- What representative similar implementation exists, and where?
```

## `3-prd.md`

This artifact is autonomous and ungated, so it has no `approved` or `revision`.

```yaml
---
topic: <kebab-case-topic>
date: <YYYY-MM-DD>
phase: prd
---
```
