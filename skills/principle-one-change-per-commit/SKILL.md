---
name: principle-one-change-per-commit
description: One logical change per commit; two changes are two commits — pointed to by git-commit and refactoring-to-patterns when work is staged.
user-invocable: false
---

# One Logical Change Per Commit

A principle, not a gate. A commit holds exactly one logical change, the
smallest unit that is independently correct. When the message needs the word
"and" to describe what happened, the commit is two commits. The payoff is all
downstream: a reviewer reads one intent at a time, a bisect lands on one
change, and a revert takes back that change and nothing beside it.

## What it rules out

- **A subject line joining two intents.** "Fix login bug and add user profile
  endpoint" is two commits — one for the fix, one for the endpoint.
- **Refactoring committed alongside a feature.** Separate the two activities:
  the structural move lands first, the behavior change second, so a reviewer
  reads new behavior against an unchanged shape.
- **An unrelated rename, format pass, or dependency bump swept into a feature
  commit**, which buries the change the reviewer came to read.
- **A commit that is one intent but not independently correct** — half a
  rename, or a caller updated without its callee.

## Boundary

- It bounds what a commit contains, not how large a commit may be. One logical
  change that touches thirty files is still one commit, and splitting it by
  file count produces commits that are individually wrong.
- It says nothing about the merge strategy. What it asks for is a branch
  history that reads as one change per commit; whether the project squashes at
  merge is the project's call.
- Leaving every commit in a passing state is a companion requirement rather
  than part of this claim, and `git-commit` states it beside the pointer here.

## Where it applies

- `skills/git-commit/SKILL.md`
- `skills/refactoring-to-patterns/SKILL.md`
