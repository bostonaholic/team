---
name: decomposing-intent
description: Turn user intent into 1-task.md, neutral 2-questions.md, and conditional PRD or repo artifacts. Loaded by questioner.
user-invocable: false
---

# Decomposing Intent

## Input

Read the user's description. Confirm any named files, modules, or errors exist.
Choose a roughly three-word kebab-case `topic`. It is the directory id after
removing its ticket/date prefix and must be identical in every artifact;
`skills/artifact-frontmatter/SKILL.md` owns the full invariant.

## Required decisions

### Decide whether a PRD is needed

Call the Skill tool with `product-requirements-doc` for vague,
multi-story, cross-cutting, or behavior-replacing requests. Otherwise omit
`3-prd.md`.

### Decide repo scope

Suspect multi-repo only when the user names multiple projects or an external
contract. Resolve candidates autonomously:

1. Require each name to match `^[A-Za-z0-9._-]+$`; reject `.`, `..`,
   separators, absolute paths, traversal, and shell metacharacters.
2. Pass values as argv, never interpolated shell text, per
   `skills/principle-never-interpolate/SKILL.md`.
3. Require `git -C <path> rev-parse --git-dir`.
4. Require
   `realpath "<root>/../<name>" == "$(dirname "$(realpath "<root>")")/<name>"`.

Write `4-repos.md` only when every candidate resolves. Otherwise stay
single-repo and name the omission in task Open assumptions. If no extra repo
is named, do not invent one. Apply
`skills/principle-record-assumptions/SKILL.md`.

## Required outputs

### 1-task.md

```markdown
---
topic: <topic>
date: <YYYY-MM-DD>
phase: task
ticketId: null
---
# Task: <topic>
## Description
<user description, preserving its framing; append confirmed clarifications>
## Stated goal
<one sentence>
## Inferred goal
<one sentence>
## Acceptance signals
- <observable completion signal>
## Open assumptions
- <scope, user, or environment assumption>
```

`ticketId` appears only here. Keep the file under 80 lines. Reference any
`docs/plans/<id>/3-prd.md`.

### 2-questions.md

```markdown
---
topic: <topic>
date: <YYYY-MM-DD>
phase: questions
---
# Research Questions: <topic>
## Codebase context
- Scope: <confirmed paths/modules>
- Vocabulary: <neutral definitions; no goal>
## Topology
## Conventions
## Constraints
## Reference points
```

Write 8–15 factual codebase questions. A stranger unaware of the goal must be
able to answer them. Scope multi-repo questions by repo. `2-questions.md`
must not state the goal or desired outcome; Codebase context replaces
`brief.md`. Apply
`skills/principle-blind-the-investigator/SKILL.md`.

### Conditional artifacts

`3-prd.md` frontmatter is `topic`, `date`, `phase: prd`; it has no
`approved` or `revision`. `4-repos.md` uses `topic`, `date`,
`phase: repos` and the schema in `artifact-frontmatter`. Do not write its
`## Worktrees` section; the orchestrator owns it.

## Done

Write `1-task.md`, `2-questions.md`, and only the applicable conditional
artifacts. Return their paths.
