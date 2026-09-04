# Baseline and commit filter

## Find the baseline

1. In `CHANGELOG.md`, find the first versioned `## [X.Y.Z] - YYYY-MM-DD` below `## [Unreleased]`.
2. Resolve its commit. Try tags first:

```bash
git rev-parse -q --verify "v<X.Y.Z>^{commit}" \
  || git rev-parse -q --verify "<X.Y.Z>^{commit}"
```

`^{commit}` dereferences annotated tags. If neither tag exists, search release subjects without assuming a prefix:

```bash
git log --oneline --grep="<X.Y.Z>" -1
```

3. List candidates:

```bash
git log --oneline <baseline>..HEAD
```

4. For unclear subjects, inspect `git show --stat <hash>` and then `git show <hash>`; classify the diff, never guess.

If no versioned heading exists, use the root commit and consider every commit.

## Filter

- Include `feat:`, `fix:`, `perf:`, every `BREAKING CHANGE:`, `security:`, and security-related `fix:`.
- Exclude `chore:`, `test:`, `refactor:`, `docs:`, `ci:`, `revert:`, WIP, fixup, and merge commits unless user-visible behavior requires an entry. For dependency bumps, describe behavior, not the dependency. A `docs:` change earns an entry only when docs are the user-facing product and it is the release’s only change. If a feature was added and reverted in the same release, include neither.

Example candidates `feat(auth): add OAuth2 login with GitHub provider`, `fix: resolve token expiry causing premature logout`, `chore: update eslint to v9`, `test: add unit tests for session middleware`, and `refactor: extract token validation to shared utility` produce:

```markdown
## [Unreleased]

### Added
- Added GitHub OAuth2 login — users can sign in with their GitHub account

### Fixed
- Fixed token expiry check that caused sessions to expire prematurely
```
