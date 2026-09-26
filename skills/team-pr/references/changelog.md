# Changelog discipline

Maintain an existing curated user-facing `CHANGELOG.md` under [Keep a Changelog](https://keepachangelog.com). Every entry answers “How does this affect me?” If the root file is absent, leave it absent and report the skip unless the user explicitly requested a new changelog.

Write at seventh-grade, STE-flavored level. Before finalizing, read the [writing standards](../team/references/writing.md) and apply its `## Self-lint`.

## Structure

All changes stay under `## [Unreleased]` until an explicit release. Each bullet belongs to exactly one of `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, or `Security`; always document vulnerability fixes. On release only, rename it using `[X.Y.Z] - YYYY-MM-DD` as `## [X.Y.Z] - YYYY-MM-DD` and add a new empty `[Unreleased]` above it.

### Explicitly requested initial file

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

## Candidate selection

### Find the baseline

1. In `CHANGELOG.md`, find the first versioned `## [X.Y.Z] - YYYY-MM-DD` below `## [Unreleased]`.
2. Resolve its commit. Try tags first:

```bash
git rev-parse -q --verify "v<X.Y.Z>^{commit}" \
  || git rev-parse -q --verify "<X.Y.Z>^{commit}"
```

If neither tag exists, search release subjects without assuming a prefix; match the version string, not a fixed prefix:

```bash
git log --oneline --grep="<X.Y.Z>" -1
```

3. List candidates:

```bash
git log --oneline <baseline>..HEAD
```

4. For unclear subjects, inspect `git show --stat <hash>` and then `git show <hash>`; classify the diff, never guess.

If no versioned heading exists, use the root commit and consider every commit.

### Filter

- Include `feat:`, `fix:`, `perf:`, every `BREAKING CHANGE:`, `security:`, and security-related `fix:`.
- Exclude `chore:`, `test:`, `refactor:`, `docs:`, `ci:`, `revert:`, WIP, fixup, and merge commits unless user-visible behavior requires an entry. For dependency bumps, describe behavior, not the dependency. A `docs:` change earns an entry only when docs are the user-facing product and it is the release’s only change. If a feature was added and reverted in the same release, include neither.

## Ship-phase procedure

1. If the root `CHANGELOG.md` is absent, create it from the initial-file template only when the user explicitly requested a new changelog. Otherwise leave it absent, report the skip, and stop.
2. Read `[Unreleased]`; skip every change already covered. An unchanged second run writes nothing.
3. Apply candidate selection above.
4. Merge commits that implement one user-visible change into one bullet. Sort each section by user impact.
5. Commit the changelog with the code it documents. If nothing survives, leave `CHANGELOG.md` untouched and report that result.

## Rules

- Describe user-observable results, never implementation details. One user-visible change gets one short bullet of one or two sentences.
- Never duplicate an entry; reruns are idempotent.
- Write in past tense: “Added X,” not “Add X.”
- Use absolute URLs for links because released sections become GitHub release notes. Use `https://github.com/<owner>/<repo>/blob/<default-branch>/<path>` or published docs; never repository-relative links. Bare `#anchors` and `mailto:` are allowed.
- A changelog rebase conflict keeps both: branch entries remain under `[Unreleased]`, above the base’s newest `## [X.Y.Z]`; every dated base section remains unchanged.
- Never create a versioned section unless the user explicitly requests a release.
