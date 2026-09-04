---
name: git-commit
description: 'Defines Conventional Commit subjects and safe commit procedure. Load before creating or reviewing commits.'
user-invocable: false
---

# Git Commit Methodology

Each commit records one independently correct decision: what changed, why, and how to understand/revert it without surrounding context. Write at seventh-grade, STE-flavored level; call `writing-prose` and apply `## Self-lint` before finalizing.

## The 50/72 Rule

- Subject: under 50 characters, imperative, specific, first word capitalized after any type prefix, and no final period. Complete “This commit will…”.
- Body: blank line after subject, wrap at 72 characters, explain motivation and non-obvious caller, migration, or compatibility effects. The diff already shows what changed.

## Conventional Commits

Use `<type>[optional scope]: <description>`, optional body, then optional footers. Allowed types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `revert`. Scope names the component/module/layer, e.g. `feat(auth):`, `fix(api):`, `docs(readme):`.

Breaking changes require a `BREAKING CHANGE:` footer or `!` in `feat!:` / `feat(api)!:`. Read [references/formats-and-examples.md](references/formats-and-examples.md) when choosing a type, scope, or breaking-change form.

## Atomic Commits

- One logical change per commit; “and” in the subject often signals two commits.
- Every commit leaves tests passing; never rely on a later commit to repair it.
- Stage selectively with `git add -p` when one file contains unrelated hunks.

## Ship-phase commit

1. Summarize the complete user-visible feature, not implementation steps.
2. Briefly list important affected files/subsystems in the body.
3. Cite the issue or plan: `Closes #42` or `Implements docs/plans/2026-01-15-auth-plan.md`.
4. Omit attempts, WIP notes, and details evident from the diff.

Complex changes need a body. Squash every `WIP: still debugging` commit before shipping.
