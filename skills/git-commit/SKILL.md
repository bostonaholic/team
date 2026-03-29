---
name: git-commit
description: Git commit discipline methodology — loaded by the ship phase to produce well-formed commits following conventional commits format, the 50/72 rule, and atomic commit principles
---

# Git Commit Methodology

A commit is the permanent record of a decision. A well-formed commit answers
three questions: what changed, why it changed, and how to understand the
change in isolation. Every commit should be correct on its own — readable
without surrounding context, reversible without side effects, and meaningful
in the project history.

## The 50/72 Rule

### Subject Line (50 characters)

The subject line is what appears in `git log --oneline`, GitHub PR titles,
and email notifications. Keep it under 50 characters.

- **Imperative mood.** "Add user authentication" not "Added user
  authentication" or "Adds user authentication". Write as if completing the
  sentence "This commit will..."
- **No period at the end.** The subject is a title, not a sentence.
- **Capitalize the first word** (after the type prefix in Conventional Commits).
- **Be specific.** "Fix bug" is not useful. "Fix null dereference in token
  parser" is useful.

### Body (72 characters per line)

The body explains the *why*, not the *what*. The diff shows what changed.
The body answers questions the diff cannot answer.

- **Separate from subject with a blank line.** This is how git distinguishes
  subject from body.
- **Wrap at 72 characters.** Many tools display git output in 80-column
  terminals; leaving 8 characters of margin prevents ugly wrapping.
- **Explain motivation.** Why was this change necessary? What problem does
  it solve? What would happen if this commit did not exist?
- **Note non-obvious consequences.** If this commit changes behavior that
  callers depend on, say so. If it requires a migration, say so. If it
  intentionally breaks something to fix something else, say so.

## Conventional Commits

Use the Conventional Commits specification for all commit messages:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | A new feature visible to users or API consumers |
| `fix` | A bug fix that corrects existing behavior |
| `refactor` | Code restructuring that does not change behavior or add features |
| `test` | Adding or modifying tests only |
| `docs` | Documentation only changes |
| `chore` | Build process, tooling, dependency updates |
| `perf` | Performance improvement |
| `ci` | CI/CD configuration changes |
| `revert` | Reverting a previous commit |

### Scope (Optional)

Scope narrows which part of the codebase was changed. Use the component,
module, or layer name: `feat(auth):`, `fix(api):`, `docs(readme):`.

### Breaking Changes

Breaking changes must be flagged in the footer with `BREAKING CHANGE:`:

```
feat(api): change authentication endpoint to use Bearer tokens

BREAKING CHANGE: The /auth endpoint now expects Authorization: Bearer <token>
instead of the previous X-API-Key header. Callers must update their headers.
```

Alternatively, append `!` to the type: `feat!:` or `feat(api)!:`.

## Atomic Commits

An atomic commit is the smallest unit of change that is independently correct.

### One Logical Change Per Commit

A commit should contain exactly one logical change. If you find yourself
writing "and" in the commit message, the commit probably contains two changes
that should be two commits.

**Bad:** "Fix login bug and add user profile endpoint"
**Good:** Two separate commits — one for the fix, one for the endpoint.

### Each Commit Must Pass Tests

Every commit in the history should leave the codebase in a passing state.
A commit that breaks tests "but the next commit fixes it" makes git bisect
unreliable and CI results meaningless.

### Stage Selectively

Use `git add -p` to stage individual hunks rather than entire files. This
allows you to separate logically distinct changes that happened to be in the
same file during development.

## Writing the Ship Phase Commit

When the ship phase creates the final commit for a feature, apply these
principles:

1. **Summarize the feature, not the implementation steps.** The ship commit
   represents the complete feature, not a log of how it was built. Write the
   subject as the feature's user-visible effect.

2. **List significant changes in the body.** If the feature touched multiple
   files or subsystems, enumerate them briefly. The PR description can go
   deeper; the commit body should orient future `git log` readers.

3. **Reference the issue or plan.** If there is an issue number or plan
   document, cite it: `Closes #42` or `Implements docs/plans/2026-01-15-auth-plan.md`.

4. **Filter out noise.** The ship commit should not mention intermediate
   steps, failed attempts, or implementation details that are already
   self-evident from the diff.

### Example Ship Commit

```
feat(auth): add OAuth2 login with GitHub provider

Implements GitHub OAuth2 flow: redirect to GitHub, exchange code for token,
create or update user record, issue session cookie.

New files:
- handlers/oauth_callback.go — token exchange and session creation
- middleware/session.go — cookie validation for protected routes

Closes #127
```

## Common Commit Mistakes

| Mistake | Example | Fix |
|---------|---------|-----|
| Vague subject | "Fix stuff" | "Fix token expiry check in session middleware" |
| Past tense | "Added config option" | "Add config option" |
| No body when needed | Commits a complex change with only a subject | Add body explaining why |
| WIP commit in history | "WIP: still debugging" | Squash into a meaningful commit before shipping |
| Multiple unrelated changes | "Fix bug, add feature, update deps" | Split into three commits |
| Trailing period | "Fix null dereference." | "Fix null dereference" |
