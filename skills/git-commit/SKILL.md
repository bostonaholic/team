---
name: git-commit
description: Create signed, atomic Conventional Commits with 50/72 formatting.
user-invocable: false
---

# Git Commit Methodology

## Input

Stage one independently correct logical change. Call the Skill tool with
`writing-prose` and apply its `## Self-lint` in STE-flavored mode.

## The 50/72 Rule

- Subject: at most 50 characters; imperative, specific, capitalized after the
  type, no period.
- Blank line after the subject.
- Body: wrap at 72 characters; explain motivation and non-obvious
  consequences, not a diff summary.

## Conventional Commits

```
<type>[optional scope]: <description>

[body]
[footer]
```

Use `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`,
`ci`, or `revert`. Mark a breaking change with `!` and/or:

```
BREAKING CHANGE: <changed contract and required caller action>
```

## Atomic Commits

- One logical change; “and” in the subject signals a likely split.
- Every commit leaves tests passing.
- Stage selectively; exclude unrelated edits and WIP/fixup history.

For a ship commit, describe the complete user-visible effect, list important
cross-system effects, reference the ticket or plan, and omit intermediate
attempts. Complex changes need a body.

## Done

The signed commit is atomic, understandable alone, and leaves the repository
passing. Verify its signature under the repository's signing policy.
