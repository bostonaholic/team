---
title: Versioning
description: "Scoped per-PR versioning for the Team plugin — PRs touching runtime paths (agents/, skills/, hooks/, .claude-plugin/) bump the version, roll their own changelog section, and carry the version in their title; dev-only PRs are exempt. CI gates the bump and auto-publishes the release on merge."
audience: [developer]
nav_order: 6
nav_label: versioning
---

# Versioning

> **Audience:** Plugin maintainers and contributors. End users do not need
> this — it describes how the Team plugin *itself* is versioned. Nothing here
> applies to projects that merely *use* the plugin.

Team versions per pull request, scoped to what actually ships: **a PR bumps
the plugin version iff its diff touches runtime/distributed paths**
(`agents/`, `skills/`, `hooks/`, `.claude-plugin/`). Dev-only PRs — docs,
tests, CI, workspace tooling — merge without a bump and publish nothing. For
bumping PRs there is no batch release step; the merge *is* the release. CI
tags and publishes automatically.

## Policy

A bump is required **iff** the PR's diff (vs the base branch) touches a
runtime path — the runtime half of the runtime-vs-development split in
[AGENTS.md](https://github.com/bostonaholic/team/blob/main/AGENTS.md):

| Paths | Bump |
|-------|------|
| **Runtime** — `agents/`, `skills/`, `hooks/`, `.claude-plugin/` | **Required** |
| **Exempt** — `docs/`, `tests/`, `evals/`, `.claude/`, `.github/`, `.beads/`, root markdown (`README.md`, `AGENTS.md`, `TESTING.md`, `CHANGELOG.md`), `package.json` / lockfile | Not required |

The `Version gate` applies three rules:

1. Runtime paths touched and version unchanged vs base → **gate fails**.
2. Version changed (regardless of paths) → **all** gate checks run: valid
   increment shape, four strings agree, changelog section present, open-PR
   collision. A **voluntary bump on an exempt PR is allowed** — but it then
   faces every one of these checks, including the changelog section.
3. Version unchanged and no runtime paths touched → gate **passes early with
   a notice**. No changelog section, no `vX.Y.Z` title prefix, and
   `release-on-merge.yml` no-ops on merge (the release for the unchanged
   version already exists).

One bumping PR = one version. When a bump is required, pick the level from
the highest-impact change in the PR (3-part [SemVer](https://semver.org)):

| Level | When |
|-------|------|
| **major** (`X.0.0`) | Breaking change to the plugin's contract (commands, artifact formats, hook behavior) |
| **minor** (`x.Y.0`) | New backward-compatible capability (`feat:`) |
| **patch** (`x.y.Z`) | Everything else — `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:` |

The level is chosen by change *type*; whether a bump is needed at all is
decided by *paths*. A `docs:` edit to `skills/*/SKILL.md` is a runtime change
(skills ship to users) and bumps patch; a `docs:` edit to `docs/` is exempt
and bumps nothing.

No runtime change merges without a bump. The `Version gate` CI check blocks
unbumped PRs that touch runtime paths and waves exempt PRs through with a
notice.

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

## Changelog: one section per bumping PR

Each **version-bumping** PR inserts its own released section — entries never
accumulate under `[Unreleased]`. Exempt PRs add no changelog section: the
merge publishes nothing, so there is nothing to release-note. To roll a
section:

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

Version-bumping PRs carry the version prefix:

```
vX.Y.Z <type>: <subject>
```

e.g. `v0.5.0 feat: adopt per-PR versioning with CI gate and auto-release`.
Exempt PRs use a plain conventional title — `<type>: <subject>` — with no
prefix. The `PR title sync` workflow rewrites a drifted title only when the
PR's version differs from the base branch's; when the version is unchanged
it does nothing (it never adds or strips a prefix on an exempt PR). Set the
title correctly yourself; the sync is a backstop, not the mechanism.

## What CI enforces, and where

Per [TESTING.md](https://github.com/bostonaholic/team/blob/main/TESTING.md), every check lives at the cheapest layer that
can catch it:

| Check | Layer | Where |
|-------|-------|-------|
| Four version strings agree; strict semver; changelog section + footer links exist for the current version (holds for exempt PRs too — their current version is the base's released one) | L2 tripwire (free, every `bun test`) | `tests/version-consistency.test.ts` |
| Runtime paths touched ⇒ version bumped vs base; any bump ⇒ valid increment shape, strings agree, changelog section, no open-PR collision; exempt + unchanged ⇒ early pass with notice | CI (needs git/API context) | `.github/workflows/version-gate.yml` |
| Title prefix matches the version — only when the PR's version differs from base; no-op otherwise | CI (needs PR context) | `.github/workflows/pr-title-sync.yml` |
| Tag + GitHub release on merge | CI (needs write perms) | `.github/workflows/release-on-merge.yml` |

Defense in depth: the gate classifies by `plugin.json` (the canonical slot),
so a PR that edits only `package.json`'s version takes the exempt path in the
gate — the L2 tripwire under `harness-checks.yml` is what catches that
partial bump.

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
   safe to re-run after a partial failure). This idempotence is also what
   makes exempt merges silent: an exempt PR merges with the version
   unchanged, the release for that version already exists, so the workflow
   no-ops — no tag, no release, no marketplace update prompt. (Existing
   behavior — the workflow needed no change for the scoped policy.)
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
- **[TESTING.md](https://github.com/bostonaholic/team/blob/main/TESTING.md)** — why each check lives at its layer.
