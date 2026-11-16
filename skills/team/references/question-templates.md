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

### `1-task.md` on the `fix` route

The frontmatter adds `route: fix` after `ticketId`:

```yaml
---
topic: <kebab-case-topic>
date: <YYYY-MM-DD>
phase: task
ticketId: null
route: fix
---
```

`## Description` opens with the absolute `0-root-cause.md` path and one
sentence: the observation numbers in `### Root cause` refer to
`## Observations` in that file. Then it holds `### Triage`, `### Root cause`,
and `### Reproduction`, in that order. Copy each from the matching
`0-root-cause.md` section body, byte for byte. Put nothing after
`### Reproduction` inside `## Description`, so each copy ends at the next copy
heading or at `## Stated goal`.

```markdown
## Description
<absolute path of 0-root-cause.md>

The observation numbers in `### Root cause` refer to `## Observations` in that file.

### Triage
<the `## Triage` body, byte for byte>

### Root cause
<the `## Root cause` body, byte for byte>

### Reproduction
<the `## Reproduction` body, byte for byte>
```

`## Acceptance signals` states these four facts:

- Each root link has a reproduction test that fails by assertion before any
  production code changes.
- Slice 1 leads with a reproduction test.
- The fix is done when every reproduction test passes.
- Each reproduction test is committed and stays in the suite.

Every other section keeps the `1-task.md` template form.

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
