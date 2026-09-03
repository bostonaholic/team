---
name: authoring-designs
description: Write or revise 6-design.md for Team's adversarial design review. Loaded by design-author.
user-invocable: false
---

# Authoring Designs

## Input

Read `1-task.md` and `5-research.md`. When sibling `3-prd.md` exists, read it first
and apply the downstream contract in
`skills/product-requirements-doc/SKILL.md`; its scope and acceptance criteria
bind the design. Read `4-repos.md` when present.

Call the Skill tool with `writing-prose` and apply its `## Self-lint` in
STE-flavored mode before finalizing.

## Required actions

### Confirm repo scope

If `4-repos.md` exists, design only for its repos and identify each affected
repo in Decisions made.

Otherwise, inspect `5-research.md` for cross-repo contracts. For each candidate
name:

1. Require `^[A-Za-z0-9._-]+$` and reject `.` or `..`.
2. Resolve only the direct sibling `<root>/../<name>`.
3. Through Glob/Read, require a `.git` entry and a real path directly under
   the home repo's parent. The questioner's Bash equivalent is
   `git -C <path> rev-parse --git-dir`.

If all candidates resolve, write `4-repos.md` using
`skills/artifact-frontmatter/SKILL.md`. If any fails, stay single-repo and
name the omitted repo and work in Risks. Never record a path outside the home
repo's parent or silently expand repo scope.

### Resolve decisions

Never pause for user input. Apply
`skills/principle-record-assumptions/SKILL.md`: mark each self-resolved
choice `Assumption — chosen without user review`, name the rejected
alternative and trade-off, and defer only low-stakes questions. On revision,
address the review findings verbatim and increment the artifact revision.

### Write the design

```markdown
# Design: <topic>

## Current state
<relevant code and adjacent components, including callers/consumers/siblings,
with file:line evidence>

## Desired end state
<behavior and file-level responsibilities after the change>

## Patterns to follow
<existing precedents with file:line evidence>

## Decisions made
<decision, rejected alternative, reason, and every surface that must change together.
Derive closed sets by an enumerating command and record that command.
Mark self-resolved choices as assumptions.>

## Out of scope
<specific excluded behavior>

## Edge cases
<chosen behavior for boundary and invalid inputs, failure paths, concurrency,
authorization, and resource limits; deferred cases belong Out of scope>

## Surfaces
<only for multiple entry modes or independently loaded paths: list each
safeguard across every surface; every no includes a reason>

| Safeguard | Mode A | Mode B |
|---|---|---|
| <rule> | yes | no — <reason> |

## Open questions (deferred)
<low-stakes deferrals>

## Risks
<compatibility, performance, migration, and operations>
```

Call the Skill tool with `systems-thinking` when it is not preloaded. Apply
its `## When Designing` section. Existing rationale for deliberate guards,
thresholds, and ownership boundaries is a constraint; use
`skills/why/SKILL.md` when research does not establish it.

## Output

Write `6-design.md`. Include no function bodies or full type definitions.
Signatures may clarify a decision. Cite precedents instead of copying them.
`skills/how/SKILL.md` defines the explanation depth for Current state.
