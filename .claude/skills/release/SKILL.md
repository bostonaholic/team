---
name: release
description: |
  Cut a new versioned release of the Team plugin consistently — bump every version
  string, roll the changelog, commit, tag, push, and publish the GitHub release in
  the right order. This is a DEVELOPMENT concern (it releases the plugin itself), not
  a runtime pipeline phase. Use when the user asks to "release a new version",
  "cut a release", "ship a release", "bump the version", or runs "/release".
---

# Release — cut a new version of the Team plugin

> Follow `skills/progress-tracking/SKILL.md`: this procedure has more than two steps —
> seed one todo item per step below before starting and mark each complete as you go.

This skill releases the **plugin itself**. It is dev tooling under `.claude/`, never
distributed. The established pattern is a single `chore(release): X.Y.Z` commit landed
**directly on `main`** (release commits bypass the worktree/PR flow), an annotated
`vX.Y.Z` tag, then a GitHub release. Match prior releases (`v0.2.0` → `v0.4.0`).

## The one mistake this skill exists to prevent

The version string lives in **four places across three files**. Forgetting one ships a
release whose tagged tree is internally inconsistent. They are:

| File | Occurrences |
|------|-------------|
| `.claude-plugin/plugin.json` | 1 (`version`) |
| `.claude-plugin/marketplace.json` | 2 (`metadata.version` **and** `plugins[0].version`) |
| `package.json` | 1 (`version`) |

A single grep gates this (step 3 + step 9). Never commit a release until all four agree.

## Steps

### 1. Preflight — clean, synced, on main

```bash
git fetch --tags origin
git rev-parse --abbrev-ref HEAD          # must be main
git status --short -uno                  # tracked tree must be clean
git rev-list --left-right --count origin/main...HEAD   # must be 0    0
```

- If the tracked tree is dirty, stop and resolve before releasing.
- **Untracked** working files (e.g. `docs/plans/...`, lock files) are fine — they will
  be left alone. Never `git add -A` during a release.

### 2. Decide the version (SemVer)

```bash
git describe --tags --abbrev=0           # last tag, e.g. v0.4.0
git log <last-tag>..HEAD --oneline       # what's shipping
```

Bump from the last tag per SemVer based on the commits / `[Unreleased]` changelog:

- **patch** (`x.y.Z`) — only `fix:`/docs/internal changes, no new behavior.
- **minor** (`x.Y.0`) — new backward-compatible features (`feat:`).
- **major** (`X.0.0`) — breaking changes to the plugin's contract.

State the chosen version and the reasoning before editing. If genuinely ambiguous, ask.

### 3. Bump all four version strings → the new version

Edit the three files so every occurrence reads the new version, then prove it:

```bash
grep -rn '"version"' package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json
```

All four lines must show the **new** version. Zero may still show the old one.

### 4. Roll the changelog

In `CHANGELOG.md` (Keep a Changelog format):

- Insert a new `## [X.Y.Z] - YYYY-MM-DD` heading (today's date) directly **below**
  `## [Unreleased]`, moving the accumulated `### Added/Changed/Fixed` entries under it.
  Leave `## [Unreleased]` in place but empty.
- Update the link-reference footer:
  - `[Unreleased]` compare base → `vX.Y.Z...HEAD`
  - Add `[X.Y.Z]: https://github.com/bostonaholic/team/compare/<prev>...vX.Y.Z`

Do not invent entries — release only what is already under `[Unreleased]`. If it is
empty, ask the user what the release contains before proceeding.

### 5. Validate JSON

```bash
node -e "['.claude-plugin/plugin.json','.claude-plugin/marketplace.json','package.json'].forEach(f=>JSON.parse(require('fs').readFileSync(f)));console.log('JSON OK')"
```

### 6. Stage ONLY the release files

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json package.json CHANGELOG.md
git status --short          # confirm only these four are staged
```

### 7. Commit and tag

```bash
git commit -m "chore(release): X.Y.Z"
git tag -a vX.Y.Z -m "Release vX.Y.Z"
```

Use an **annotated** tag (`-a`), message exactly `Release vX.Y.Z`, matching prior tags.

### 8. Push commit + tag

```bash
git push origin main
git push origin vX.Y.Z
```

### 9. Verify the tagged tree is consistent

```bash
git show vX.Y.Z:package.json | grep '"version"'      # must be the new version
git show vX.Y.Z:.claude-plugin/plugin.json | grep '"version"'
```

If a version was forgotten and the tag was already pushed: `git add` the fix,
`git commit --amend --no-edit`, re-point the tag with `git tag -f -a vX.Y.Z -m "Release vX.Y.Z"`,
then `git push --force-with-lease origin main && git push --force origin vX.Y.Z`.
(Safe only because release commits sit alone on main with no follower commits — confirm
`origin/main` still equals your pre-amend commit first.)

### 10. Publish the GitHub release

Write notes in the **highlights** style of prior releases — a one-line summary, then
`### Added` / `### Changed` / `### Fixed` distilled (not copy-pasted) from the changelog,
closing with full-changelog + compare links.

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <notes.md>
gh release view vX.Y.Z --json url -q .url
```

### 11. Report

Summarize: version chosen + reasoning, the four files bumped, commit/tag SHAs, and the
release URL. Note any untracked files deliberately left out of the release commit.
