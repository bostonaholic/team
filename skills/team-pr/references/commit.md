# Commit discipline

Write at seventh-grade, STE-flavored level; read the [writing standards](../team/references/writing.md) and apply its `## Self-lint` before finalizing.

Each commit records one independently correct decision: what changed, why, and how to understand/revert it without surrounding context.

## The 50/72 Rule

- Subject: under 50 characters, imperative, specific, first word capitalized after any type prefix, and no final period. Complete “This commit will…”.
- Body: blank line after subject, wrap at 72 characters, explain motivation and non-obvious caller, migration, or compatibility effects.

## Conventional Commits

Use `<type>[optional scope]: <description>`, optional body, then optional footers, with a type from the table below. Scope names the component, e.g. `feat(auth):`.

Breaking changes require a `BREAKING CHANGE:` footer or `!` in `feat!:` / `feat(api)!:`.

| Type | Use |
|---|---|
| `feat` | User/API feature |
| `fix` | Existing-behavior bug fix |
| `refactor` | Restructure without behavior change |
| `test` | Tests only |
| `docs` | Documentation only |
| `chore` | Build, tooling, dependencies |
| `perf` | Performance improvement |
| `ci` | CI/CD configuration |
| `revert` | Prior-commit revert |

## Atomic Commits

One logical change per commit, each leaving tests passing; stage with `git add -p` to split unrelated hunks.

## Ship-phase commit

1. Summarize the complete user-visible feature, not implementation steps.
2. Briefly list important affected files/subsystems in the body.
3. Cite the issue or plan: `Closes #42` or `Implements docs/plans/2026-01-15-auth-plan.md`.
4. Omit attempts, WIP notes, and details evident from the diff.

Complex changes need a body. Squash every `WIP: still debugging` commit before shipping.
