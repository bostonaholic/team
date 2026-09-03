---
name: decomposing-intent
description: Derive neutral questions and conditional PRD or repo artifacts from 1-task.md. Loaded by questioner.
user-invocable: false
---

# Decomposing Intent

## Input

In the Team pipeline, read the supplied `1-task.md` and its `## Request`. Copy
its `topic` and `date`; never modify it. Confirm any named files, modules, or
errors before using them in questions.

For a legacy direct questioner dispatch without `1-task.md`, use the description,
choose a roughly three-word kebab-case topic, and write the canonical task
artifact with `workflow: team` and the full description under `## Request`.
`skills/artifact-frontmatter/SKILL.md` owns both schemas and the topic rule.

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
single-repo and name the omission in `2-questions.md` under `## Scope
assumptions`. If no extra repo is named, do not invent one. Apply
`skills/principle-record-assumptions/SKILL.md`.

## Required outputs

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
## Scope assumptions
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
`## Worktrees` section; the internal WORKTREE module owns it.

## Done

Preserve the supplied `1-task.md`. Write `2-questions.md` and only the applicable
conditional artifacts. Return their paths. A legacy direct dispatch also
returns the new `1-task.md` path.
