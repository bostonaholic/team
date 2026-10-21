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

### List candidates

`<team-pr-skill-dir>` is the absolute directory that holds the installed `skills/team-pr/SKILL.md`. Run `node "<team-pr-skill-dir>/scripts/changelog-candidates.mjs" <repo-dir>`:

- Exit 0: the printed `commits` are the candidates since the baseline release, each with the filter's default `rule`. An empty list means nothing to add.
- Exit 1: `CHANGELOG.md` is absent; apply ship-phase step 1.
- Exit 2: leave `CHANGELOG.md` untouched and report the stderr line as the skip reason.

### Filter

Each candidate's `rule` is the conventional-type default: `include`, `exclude`, or `review`. Then judge each candidate, because these exceptions need the diff:

- For a `review` commit or an unclear subject, inspect `git show --stat <hash>` and then `git show <hash>`; classify the diff, never guess.
- An `exclude` commit still earns an entry when user-visible behavior requires one. For dependency bumps, describe behavior, not the dependency. A `docs:` change earns an entry only when docs are the user-facing product and it is the release’s only change.
- If a feature was added and reverted in the same release, include neither.

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
