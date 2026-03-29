---
name: changelog
description: Keep a Changelog methodology — loaded by the ship phase to update CHANGELOG.md with user-facing changes, filtering out internal-only commits
---

# Changelog

A changelog is a curated, human-readable record of notable changes to a
project. It exists for users and consumers of the project — not for
developers. Every entry should answer: "How does this affect me?"

This methodology follows [Keep a Changelog](https://keepachangelog.com)
conventions.

## File Structure

The changelog lives at `CHANGELOG.md` in the project root. If it does not
exist, create it.

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- ...

### Changed
- ...

### Fixed
- ...
```

## Section Types

Every entry belongs to exactly one section:

| Section | When to use |
|---------|-------------|
| `Added` | New features, new commands, new options |
| `Changed` | Changes to existing behavior that users will notice |
| `Deprecated` | Features scheduled for removal in a future release |
| `Removed` | Features removed in this release |
| `Fixed` | Bug fixes |
| `Security` | Vulnerability fixes — always document these |

## The Unreleased Section

All changes go under `[Unreleased]` until a version is tagged. When a version
is released, the `[Unreleased]` section is renamed to `[X.Y.Z] - YYYY-MM-DD`
and a new empty `[Unreleased]` section is added above it.

```markdown
## [Unreleased]

## [1.2.0] - 2026-03-15

### Added
- OAuth2 login with GitHub provider
```

## Writing Entries

Each entry is a single bullet point. Write it from the user's perspective —
what they can now do, what changed, what was fixed.

### Good entries

```markdown
- Add GitHub OAuth2 login — users can now sign in with their GitHub account
- Fix token expiry check that caused premature session logout
- Change API rate limit from 100 to 1000 requests per minute
```

### Bad entries

```markdown
- Refactor auth middleware to use new token validation pattern
- Update dependencies
- Fix bug in session.go line 42
- WIP cleanup
```

The bad entries describe implementation details. They tell developers what
changed in the code, not users what changed in their experience.

## Filtering Commits for Changelog Entries

When generating changelog entries from commit history, apply this filter:

### Include

- `feat:` commits — these are new features. Every feat commit gets an entry.
- `fix:` commits — these are bug fixes. Every fix commit gets an entry.
- `perf:` commits — performance improvements users will feel.
- `BREAKING CHANGE:` — always include, regardless of commit type.
- `security:` or security-related `fix:` — always include.

### Exclude

- `chore:` commits — tooling, build, dependency updates (unless a dependency
  update changes user-visible behavior, in which case document the behavior
  change, not the dep update).
- `test:` commits — internal test additions/changes.
- `refactor:` commits — internal code restructuring with no behavior change.
- `docs:` commits — unless the docs change represents the *only* change in
  the release and users rely on the documentation as the product.
- `ci:` commits — CI/CD pipeline changes.
- `revert:` commits — if a feat was added and reverted in the same release,
  neither appears in the changelog.
- WIP commits, fixup commits, merge commits.

## Applying This in the Ship Phase

When the ship phase runs, before committing:

1. **Scan commits since the last changelog entry.** Use `git log` to find
   commits since the last version tag or the last changelog update.

2. **Filter to user-facing commits** using the Include/Exclude rules above.

3. **Translate each included commit to a user-facing bullet.** Rewrite the
   commit message in plain language if the commit message is technical.
   The entry should complete the sentence: "Users can now..." or "We fixed..."

4. **Add entries under `[Unreleased]`** in the appropriate section.

5. **Sort within sections:** most impactful changes first.

6. **Include the changelog update in the ship commit.** The `CHANGELOG.md`
   change should be part of the same commit as the code changes it documents.

### Example Transformation

Given these commits:
```
feat(auth): add OAuth2 login with GitHub provider
fix: resolve token expiry causing premature logout
chore: update eslint to v9
test: add unit tests for session middleware
refactor: extract token validation to shared utility
```

The changelog entry would be:

```markdown
## [Unreleased]

### Added
- GitHub OAuth2 login — users can sign in with their GitHub account

### Fixed
- Token expiry check that caused sessions to expire prematurely
```

`chore`, `test`, and `refactor` commits are excluded. The `feat` and `fix`
commits are rewritten in user-facing language.

## Rules

- **Never document internal implementation details.** If a user would not
  notice the change in behavior, it does not go in the changelog.
- **One entry per user-visible change.** Multiple commits that implement a
  single feature produce one entry.
- **Write in past tense.** "Added X" not "Add X". The changelog records what
  happened.
- **Keep entries short.** One to two sentences maximum. Link to documentation
  for details if needed.
- **Always update `[Unreleased]`.** Never create a versioned section without
  the user explicitly asking for a release.
