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
- Where does <component class> live, and what consumes / produces <relevant data>?

## Conventions
- What test framework, naming, structure, and error handling does <relevant subsystem> use?

## Constraints
- What types, schemas, or interfaces must changes here honor, and what existing utilities provide <relevant capability>?

## Reference points
- What representative similar implementation exists, and where?
```
