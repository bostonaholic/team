# Commit discipline

Before creating a commit, read this file and apply it. Write at seventh-grade, STE-flavored level; read the [writing standards](../team/references/writing.md) and apply its `## Self-lint` before finalizing.

Each commit records one independently correct decision: what changed, why, and how to understand/revert it without surrounding context.

## The 50/72 Rule

- Subject: under 50 characters, imperative, specific, first word capitalized after any type prefix, and no final period. Complete “This commit will…”.
- Body: blank line after subject, wrap at 72 characters, explain motivation and non-obvious caller, migration, or compatibility effects. The diff already shows what changed.

## Conventional Commits

Use `<type>[optional scope]: <description>`, optional body, then optional footers. Allowed types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `revert`. Scope names the component/module/layer, e.g. `feat(auth):`, `fix(api):`, `docs(readme):`.

Breaking changes require a `BREAKING CHANGE:` footer or `!` in `feat!:` / `feat(api)!:`.

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

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

Breaking-change example:

```text
feat(api): change authentication endpoint to use Bearer tokens

BREAKING CHANGE: The /auth endpoint now expects Authorization: Bearer <token>
instead of the previous X-API-Key header. Callers must update their headers.
```

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

Ship example:

```text
feat(auth): add OAuth2 login with GitHub provider

Implements GitHub OAuth2 flow: redirect to GitHub, exchange code for token,
create or update user record, issue session cookie.

New files:
- handlers/oauth_callback.go — token exchange and session creation
- middleware/session.go — cookie validation for protected routes

Closes #127
```

Bad combined subject: `Fix login bug and add user profile endpoint`. Split it into a fix commit and a feature commit.
