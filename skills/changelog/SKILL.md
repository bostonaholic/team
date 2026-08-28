---
name: changelog
description: Keep a Changelog methodology — loaded by the ship phase to update CHANGELOG.md with user-facing changes, filtering out internal-only commits
user-invocable: false
---

# Changelog

A changelog is a curated, human-readable record of notable changes to a
project. It exists for users and consumers of the project — not for
developers. Every entry should answer: "How does this affect me?"

This methodology follows [Keep a Changelog](https://keepachangelog.com)
conventions.

Write the prose this skill governs at a seventh-grade reading level, in
STE-flavored mode — short sentences, common words, no unexplained jargon.
Full methodology: `writing-prose`. Before
you finalize prose this skill governs, call the Skill tool with
`writing-prose` and apply its `## Self-lint` checklist.

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

## Finding the Baseline

Before any commit is classified, find the **baseline** — the point in history
the last release was cut from. Every commit after it is a candidate.

1. **Read `CHANGELOG.md` and find the most recent *versioned* heading.** That
   is the first `## [X.Y.Z] - YYYY-MM-DD` below `## [Unreleased]`. Its version
   is the baseline version.

2. **Resolve that version to a commit.** Try the tag first:

   ```bash
   git rev-parse -q --verify "v<X.Y.Z>^{commit}" \
     || git rev-parse -q --verify "<X.Y.Z>^{commit}"
   ```

   The `^{commit}` suffix matters. An annotated tag resolves to the tag object
   without it, not to the commit the tag points at.

   **A project that ships without tags is normal, not an error.** When neither
   name resolves, find the release commit by its subject. The version string is
   in that subject whatever the project's convention:

   ```bash
   git log --oneline --grep="<X.Y.Z>" -1
   ```

   Release subjects differ by project — `v0.37.0 feat(scope): …` for a
   version-prefixed squash merge, `chore(release): 0.37.0` elsewhere. Match on
   the version string. Never assume a fixed prefix.

3. **List the candidates:**

   ```bash
   git log --oneline <baseline>..HEAD
   ```

4. **Read any commit you cannot classify from its subject.** `git show --stat
   <hash>` gives the blast radius, `git show <hash>` the change itself. Classify
   an ambiguous commit from its diff. Do not guess from the subject.

If `CHANGELOG.md` holds no versioned heading yet, the first release is not cut.
The baseline is then the root commit, and every commit is a candidate.

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

Before committing: find the baseline, list the commits after it, apply the
filter, then write. Three steps carry rules the sections above do not:

1. **Drop what `[Unreleased]` already says.** Read the existing section before
   you write anything and skip every commit already covered. A second run over
   a current changelog must change nothing.
2. **Sort within sections:** most impactful first. Include the `CHANGELOG.md`
   change in the same commit as the code it documents.
3. **Report what happened.** If no commit survived the filter, say so and
   leave `CHANGELOG.md` untouched. A release with no user-facing change is a
   correct outcome, not a failure — never pad `[Unreleased]` to have something
   to show.

Worked example. Given `feat(auth): add OAuth2 login with GitHub provider`,
`fix: resolve token expiry causing premature logout`, `chore: update eslint to
v9`, `test: add unit tests for session middleware`, and `refactor: extract
token validation to shared utility`, the `chore`, `test`, and `refactor`
commits are excluded and the rest are rewritten user-facing:

```markdown
## [Unreleased]

### Added
- GitHub OAuth2 login — users can sign in with their GitHub account

### Fixed
- Token expiry check that caused sessions to expire prematurely
```

## Rules

- **Never document internal implementation details.** If a user would not
  notice the change in behavior, it does not go in the changelog.
- **One entry per user-visible change.** Multiple commits that implement a
  single feature produce one entry.
- **Never duplicate an entry.** Check `[Unreleased]` before you add to it. This
  skill runs more than once against the same branch, so it must be safe to
  repeat: the second run over an unchanged branch writes nothing.
- **Write in past tense.** "Added X" not "Add X". The changelog records what
  happened.
- **Keep entries short.** One to two sentences maximum. Link to documentation
  for details if needed — with an **absolute URL** (see next rule).
- **Use absolute URLs for links.** A released changelog section is reused
  *verbatim* as the GitHub release notes, and the release page is not served
  from the repository root — so repository-relative links (e.g.
  `[versioning](docs/versioning.md)`) become dead links there. Always write full
  `https://…` URLs — the file's GitHub blob URL
  (`https://github.com/<owner>/<repo>/blob/<default-branch>/<path>`) or your
  published docs site — never relative paths. Bare `#anchors` and `mailto:`
  targets are fine.
- **Always update `[Unreleased]`.** Never create a versioned section without
  the user explicitly asking for a release.
