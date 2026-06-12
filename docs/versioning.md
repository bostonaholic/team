---
title: Versioning
description: "Per-PR versioning for the Team plugin — every PR bumps the version, rolls its own changelog section, and carries the version in its title; CI gates the bump and auto-publishes the release on merge."
---

# Versioning

> **Audience:** Plugin maintainers and contributors. End users do not need
> this — it describes how the Team plugin *itself* is versioned. Nothing here
> applies to projects that merely *use* the plugin.

Team versions per pull request: **every PR that lands on `main`
bumps the plugin version** — features, fixes, chores, docs, all of them. There
is no batch release step; the merge *is* the release. CI tags and publishes
automatically.

## Policy

One PR = one version. Pick the bump level from the highest-impact change in
the PR (3-part [SemVer](https://semver.org)):

| Level | When |
|-------|------|
| **major** (`X.0.0`) | Breaking change to the plugin's contract (commands, artifact formats, hook behavior) |
| **minor** (`x.Y.0`) | New backward-compatible capability (`feat:`) |
| **patch** (`x.y.Z`) | Everything else — `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:` |

No PR merges without a bump. The `Version gate` CI check blocks unbumped PRs.

## The four version strings

The version lives in **four places across three files**. Forgetting one ships
an internally inconsistent tree — this is the single most common versioning
mistake in this repo's history.

| File | Occurrences |
|------|-------------|
| `.claude-plugin/plugin.json` | 1 (`version`) — **canonical; CI reads this one** |
| `.claude-plugin/marketplace.json` | 2 (`metadata.version` **and** `plugins[0].version`) |
| `package.json` | 1 (`version`) |

One grep proves consistency:

```sh
grep -rn '"version"' package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json
```

All four lines must show the same version. `tests/version-consistency.test.ts`
enforces this on every `bun test` run.

## Picking the next free version

Parallel workspaces mean parallel open PRs, and two PRs must never claim the
same version. Compute yours with the helper:

```sh
.claude/scripts/next-version.sh <major|minor|patch>
```

It bumps from `origin/main`'s version, then walks past any version already
claimed by another open PR (read from each PR head's `plugin.json` via the
GitHub API; fail-open if the API is unreachable). Gaps in the sequence are
fine; collisions are not.

**Collision resolution:** the **older PR (lower number) keeps the slot**. If
the gate reports your version is claimed by an older PR: rebase on `main`,
re-run `next-version.sh`, re-bump, force-push. The gate passes the older PR
and fails only the newer one, so exactly one side has to move.

## Changelog: one section per PR

Each PR inserts its own released section — entries never accumulate under
`[Unreleased]`:

1. Insert `## [X.Y.Z] - YYYY-MM-DD` (today's date) directly **below**
   `## [Unreleased]`, with the PR's `### Added` / `### Changed` / `### Fixed`
   entries. `## [Unreleased]` stays in place, permanently empty.
2. Update the link-reference footer:
   - `[Unreleased]` compare base → `vX.Y.Z...HEAD`
   - Add `[X.Y.Z]: https://github.com/bostonaholic/team/compare/v<prev>...vX.Y.Z`

Entry style follows `skills/changelog/SKILL.md` (Keep a Changelog, plain
prose, user-facing). Because the section is the release notes (see below),
write it for a reader deciding whether to upgrade.

## PR title

PR titles carry the version prefix:

```
vX.Y.Z <type>: <subject>
```

e.g. `v0.5.0 feat: adopt per-PR versioning with CI gate and auto-release`.
The `PR title sync` workflow rewrites drifted titles to match the PR head's
`plugin.json` — but set it correctly yourself; the sync is a backstop, not
the mechanism.

## What CI enforces, and where

Per [TESTING.md](../TESTING.md), every check lives at the cheapest layer that
can catch it:

| Check | Layer | Where |
|-------|-------|-------|
| Four version strings agree; strict semver; changelog section + footer links exist for the current version | L2 tripwire (free, every `bun test`) | `tests/version-consistency.test.ts` |
| Version bumped vs base; valid increment shape; collision with other open PRs | CI (needs git/API context) | `.github/workflows/version-gate.yml` |
| Title prefix matches the version | CI (needs PR context) | `.github/workflows/pr-title-sync.yml` |
| Tag + GitHub release on merge | CI (needs write perms) | `.github/workflows/release-on-merge.yml` |

**Known race, accepted:** the version gate re-runs when *your* PR changes
(`synchronize`), not when *another* PR merges. The mitigation is the branch
protection setting "Require branches to be up to date before merging" with
`Version gate` as a required check — the forced rebase triggers a re-run
against the new base. Backstop: `release-on-merge.yml` fails loudly if a
merged version's tag already exists, so a slipped duplicate is detected, never
silently lost.

## Release on merge

On every push to `main`, `release-on-merge.yml`:

1. Reads the version from `.claude-plugin/plugin.json`.
2. No-ops if the GitHub release `vX.Y.Z` already exists (idempotent —
   safe to re-run after a partial failure).
3. Extracts that version's `## [X.Y.Z]` section from `CHANGELOG.md` as the
   release notes (verbatim — the changelog section *is* the release notes).
4. Creates the annotated tag `vX.Y.Z` (message `Release vX.Y.Z`) if missing,
   pushes it, and publishes the GitHub release.

## Recovery

### A version string was missed and the tag is already pushed

`git add` the fix, `git commit --amend --no-edit`, re-point the tag with
`git tag -f -a vX.Y.Z -m "Release vX.Y.Z"`, then
`git push --force-with-lease origin main && git push --force origin vX.Y.Z`.
Safe only if no commits landed after the broken one — confirm `origin/main`
still equals your pre-amend commit first. (This should be near-impossible now:
the bun test and the version gate both check string agreement before merge.)

### The release workflow failed after merge

Re-run the failed `Release on merge` workflow run — it is idempotent (keyed on
release existence first, then tag existence). For a fully manual fallback:

```sh
V=$(jq -r .version .claude-plugin/plugin.json)
awk "/^## \[$V\]/{f=1;next} /^## \[/{f=0} f" CHANGELOG.md > /tmp/notes.md
git tag -a "v$V" -m "Release v$V" && git push origin "v$V"
gh release create "v$V" --title "v$V" --notes-file /tmp/notes.md
```

## Read next

- **[Project Tracking](project-tracking.md)** — the board the PR's issue moves across.
- **[TESTING.md](../TESTING.md)** — why each check lives at its layer.
