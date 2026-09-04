# Commit formats and examples

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
