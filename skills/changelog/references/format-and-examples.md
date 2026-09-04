# Changelog format and examples

Use this initial file:

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

Section meanings:

| Section | Use |
|---|---|
| `Added` | New features, commands, or options |
| `Changed` | Existing behavior users notice |
| `Deprecated` | Features scheduled for later removal |
| `Removed` | Features removed in this release |
| `Fixed` | Bug fixes |
| `Security` | Vulnerability fixes; always include |

Released example:

```markdown
## [Unreleased]

## [1.2.0] - 2026-03-15

### Added
- OAuth2 login with GitHub provider
```

Good entries describe outcomes: `- Added GitHub OAuth2 login — users can now sign in with their GitHub account`; `- Fixed token expiry check that caused premature session logout`; `- Changed API rate limit from 100 to 1000 requests per minute`.

Exclude implementation prose such as `Refactor auth middleware`, `Update dependencies`, `Fix bug in session.go line 42`, or `WIP cleanup`.
