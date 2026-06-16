---
title: Versioning
description: "Land-time versioning for the Team plugin — a drafted PR carries no version and accumulates changelog bullets under [Unreleased]; at land time the dev version-bump skill assigns the version against current main, cuts the changelog section, sets the title, and runs the land-time consistency assertion, then the generic runtime /shipit skill pushes, waits for CI, and rebase-merges. CI auto-publishes the release on merge."
audience: [developer]
nav_order: 6
nav_label: versioning
---

# Versioning

> **Audience:** Plugin maintainers and contributors. End users do not need
> this — it describes how the Team plugin *itself* is versioned. Nothing here
> applies to projects that merely *use* the plugin.

Team assigns the version at **land time**, not per PR. A drafted PR carries no
version, no `vX.Y.Z` title, and no released changelog section — it accumulates
bullets under `[Unreleased]`. Landing a Team PR is **two steps**:

1. **Bump** — the **dev** `version-bump` skill (`.claude/skills/version-bump/SKILL.md`)
   is Team's internal bumper. Run against current `main`, it assigns the next
   version, bumps the four version strings, cuts the `[Unreleased]` body into a
   dated `## [X.Y.Z]` section, sets the PR title, runs the land-time consistency
   assertion, and commits `chore(version): X.Y.Z`.
2. **Land** — the **generic, distributed** runtime `/shipit` skill
   (`skills/shipit/SKILL.md`) pushes the branch, waits for CI, and rebase-merges.
   `shipit` is project-agnostic: it does no versioning or changelog work. It is
   shipped to Team's *users* as a general "land a reviewed PR" utility; Team's
   own version logic stays in `version-bump`.

There is no batch release step; the merge *is* the release. CI tags and
publishes automatically.

## Why land time

When every open PR claims its own version up front, parallel PRs contend for the
same number — every rebase forces a re-bump, and the gate blocks honest work
that simply hasn't picked a free slot. Assigning the version at land time
removes the contention entirely: a PR is just a diff plus `[Unreleased]`
bullets until the moment it lands. Because `version-bump` runs only at land and
one PR lands at a time, the assigned number is always free — the serialization
*is* the collision defense.

## The bump sequence (`version-bump`)

Run the dev `version-bump` skill against current `main`, on the branch you
intend to land:

1. Decides the bump level from the PR's commits (3-part
   [SemVer](https://semver.org): breaking → major, `feat:` → minor, everything
   else → patch).
2. Computes the next free version (`next-version.sh`).
3. Bumps the four version strings.
4. **Cuts the changelog section**: moves the `[Unreleased]` body into a dated
   `## [X.Y.Z]` section and re-points the footer.
5. Runs the **land-time consistency assertion** — after the cut, before the
   commit (see [Land-time consistency assertion](#land-time-consistency-assertion)).
6. Commits the bump (`chore(version): X.Y.Z`) and sets the PR title.

Then run `/shipit` to push, wait for CI, and rebase-merge.

## Land-time consistency assertion

This is the in-tree replacement for the per-PR CI gate that used to enforce a
bump on every PR. Because the version is assigned only at land time, the
released-changelog invariants hold only **after** `version-bump` cuts the
section — so `version-bump` re-runs them itself rather than CI checking them on
every push. The assertion runs **after the changelog cut and before the commit**
(fail fast, fail loud — never commit an invalid tree) and checks:

- `tests/version-consistency.test.ts` passes (strict semver + the four strings
  agree);
- the dated `## [X.Y.Z] - YYYY-MM-DD` released section exists;
- the footer carries a `[X.Y.Z]: …compare/…` link and the `[Unreleased]` footer
  compares from `vX.Y.Z...HEAD`.

If any check fails, `version-bump` stops before committing — nothing is
committed, pushed, or merged. See `.claude/skills/version-bump/SKILL.md` step 5.

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

## Picking the next version

`version-bump` computes the version with the helper:

```sh
.claude/scripts/next-version.sh <major|minor|patch>
```

It prints `bump(<default branch>'s version, level)` — a **deterministic** pure
function of the base version and the level, with **no open-PR scan**. The base
is read from the remote's default branch, resolved via `origin/HEAD` (so
`main`, `master`, or any other default branch works — it is not hardcoded). Under the
land-time model the version is assigned against current `main` and landing is
serialized (one PR at a time), so `bump(main, level)` is always free; the
collision defenses are serialization, `shipit`'s rebase-and-recompute on a
concurrent race, and `release-on-merge.yml`'s duplicate-tag rejection. (Set
`BASE_VERSION=x.y.z` to override the base the script reads — used by its tests.)

> Earlier revisions walked past any version *claimed by another open PR* (via
> the GitHub API). That was the retired per-PR model's mechanism; it made the
> output depend on whatever PRs were open and **skipped free versions** a stale
> PR happened to claim. It is gone — `tests/next-version.test.ts` locks it out.

## Changelog: accumulate under `[Unreleased]`, cut at land time

`[Unreleased]` accumulates bullets while the PR is in flight; the dated section
is cut only when the PR lands.

- **While drafting** (`team-pr`): add this PR's user-facing bullets under
  `## [Unreleased]` (entry style per `skills/changelog/SKILL.md`). No dated
  section, no footer compare link — the PR carries no version yet.
- **At land time** (`version-bump`): *move* the `[Unreleased]` body into a new
  dated section, leaving `[Unreleased]` empty again:
  1. Insert `## [X.Y.Z] - YYYY-MM-DD` (today's date) directly **below**
     `## [Unreleased]`, containing the accumulated body.
  2. Update the link-reference footer:
     - `[Unreleased]` compare base → `vX.Y.Z...HEAD`
     - Add `[X.Y.Z]: https://github.com/bostonaholic/team/compare/v<prev>...vX.Y.Z`

The dated section becomes the GitHub release notes verbatim (see below), so
write it for a reader deciding whether to upgrade. **Empty `[Unreleased]` at
land:** `version-bump` derives at least one bullet from the PR's commits, else
stops and asks for an entry — it never cuts an empty section
(`release-on-merge.yml` errors on empty release notes).

## PR title

A drafted PR uses a plain conventional title — `<type>: <subject>` — with no
version prefix. `version-bump` sets the `vX.Y.Z <type>: <subject>` title when it
bumps at land time:

```
vX.Y.Z <type>: <subject>
```

e.g. `v0.6.0 feat: add the shipit land skill`. The `PR title sync` workflow
rewrites a drifted title only when the PR's version differs from the base
branch's (i.e. after `version-bump` has bumped); while the version is unchanged
it does nothing. It is a backstop, not the mechanism.

## What CI enforces, and where

Per [the testing guide](testing.md), every check lives at the cheapest layer that
can catch it:

| Check | Layer | Where |
|-------|-------|-------|
| Four version strings agree; strict semver (holds on every commit, drafted or landed) | L2 tripwire (free, every `bun test`) | `tests/version-consistency.test.ts` |
| Released-section + footer-compare-link invariants hold for the assigned version — run after the changelog cut, before the commit | Land-time assertion (`version-bump`) | `.claude/skills/version-bump/SKILL.md` |
| Title prefix matches the version — only when the PR's version differs from base (after `version-bump` bumps); no-op otherwise | CI (needs PR context) | `.github/workflows/pr-title-sync.yml` |
| Tag + GitHub release on merge | CI (needs write perms) | `.github/workflows/release-on-merge.yml` |

The land-time assertion row is the in-tree replacement for the per-PR CI gate
that used to enforce a bump on every PR — see
[Land-time consistency assertion](#land-time-consistency-assertion) for what it
checks and when.

## Release on merge

On every push to `main`, `release-on-merge.yml`:

1. Reads the version from `.claude-plugin/plugin.json`.
2. No-ops if the GitHub release `vX.Y.Z` already exists (idempotent — safe to
   re-run after a partial failure).
3. Extracts that version's `## [X.Y.Z]` section from `CHANGELOG.md` as the
   release notes (verbatim — the changelog section *is* the release notes).
4. Creates the annotated tag `vX.Y.Z` (message `Release vX.Y.Z`) if missing,
   pushes it, and publishes the GitHub release.

Because `version-bump` cut the section before landing, the section the release
workflow reads is exactly what `version-bump` wrote.

## Recovery

### `/shipit` stopped before merge (CI failed or timed out)

The `chore(version)` bump commit is **already on the branch** (committed by
`version-bump`, pushed by `/shipit`) — only the merge did not happen. Fix CI
(push the fix to the same branch), then re-run `/shipit`: it simply pushes any
new commits, waits again, and merges. Do **not** re-run `version-bump` — the
version was already assigned; a second bump would just create a redundant commit.

### A version string was missed and the tag is already pushed

`git add` the fix, `git commit --amend --no-edit`, re-point the tag with
`git tag -f -a vX.Y.Z -m "Release vX.Y.Z"`, then
`git push --force-with-lease origin main && git push --force origin vX.Y.Z`.
Safe only if no commits landed after the broken one — confirm `origin/main`
still equals your pre-amend commit first. (This should be near-impossible: the
bun test and `version-bump`'s land-time assertion both check string agreement
before the merge.)

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
- **[Testing](testing.md)** — why each check lives at its layer.
