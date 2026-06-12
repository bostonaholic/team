---
name: version-bump
description: |
  Bump the Team plugin version for the current PR — every PR that lands bumps the
  version (docs/versioning.md): pick the SemVer level, compute the next free version,
  update all four version strings, roll a per-PR changelog section, and title the PR
  vX.Y.Z. This is a DEVELOPMENT concern (it versions the plugin itself), not a runtime
  pipeline phase. Use when preparing any PR in this repo, or when the user asks to
  "bump the version", "prepare the PR version", or runs "/version-bump".
---

# Version Bump — version the current PR

> Follow `skills/progress-tracking/SKILL.md`: this procedure has more than two steps —
> seed one todo item per step below before starting and mark each complete as you go.

This skill versions the **plugin itself**, once per PR, before the PR opens (or
before pushing new work to an existing PR). Tagging and the GitHub release are
**not** part of this procedure — `release-on-merge.yml` does both automatically
when the PR merges. Full policy: [docs/versioning.md](../../../docs/versioning.md).

## Steps

### 1. Decide the bump level

```bash
git log origin/main..HEAD --oneline
git diff origin/main...HEAD --stat
```

Pick the highest-impact change in the PR:

- **major** — breaking change to the plugin's contract (commands, artifact formats, hook behavior).
- **minor** — new backward-compatible capability (`feat:`).
- **patch** — everything else (`fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`).

State the chosen level and the reasoning. If genuinely ambiguous, ask.

### 2. Compute the next free version

```bash
bash .claude/scripts/next-version.sh <level>
```

This bumps from `origin/main` and walks past versions claimed by other open
PRs (fail-open on API errors — CI's version gate is the authoritative check).

### 3. Bump all four version strings

The version lives in **four places across three files**:

| File | Occurrences |
|------|-------------|
| `.claude-plugin/plugin.json` | 1 (`version`) |
| `.claude-plugin/marketplace.json` | 2 (`metadata.version` **and** `plugins[0].version`) |
| `package.json` | 1 (`version`) |

Edit all three files, then prove it:

```bash
grep -rn '"version"' package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json
```

All four lines must show the **new** version. Zero may still show the old one.

### 4. Roll the changelog

In `CHANGELOG.md` (Keep a Changelog format, entry style per
`skills/changelog/SKILL.md`):

- Insert `## [X.Y.Z] - YYYY-MM-DD` (today's date) directly **below**
  `## [Unreleased]`, containing this PR's `### Added/Changed/Fixed` entries.
  `## [Unreleased]` stays in place, permanently empty.
- Update the link-reference footer:
  - `[Unreleased]` compare base → `vX.Y.Z...HEAD`
  - Add `[X.Y.Z]: https://github.com/bostonaholic/team/compare/v<prev>...vX.Y.Z`

This section becomes the GitHub release notes verbatim — write it for a
reader deciding whether to upgrade.

### 5. Verify

```bash
bun test tests/version-consistency.test.ts
node -e "['.claude-plugin/plugin.json','.claude-plugin/marketplace.json','package.json'].forEach(f=>JSON.parse(require('fs').readFileSync(f)));console.log('JSON OK')"
```

### 6. Commit

Commit the bump as its own commit in the PR branch, for clean reverts:

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json package.json CHANGELOG.md
git commit -m "chore(version): X.Y.Z"
```

### 7. Title the PR

`vX.Y.Z <type>: <subject>` — e.g. `v0.5.0 feat: adopt per-PR versioning`.
Set it when opening (`gh pr create --title`) or fix an existing PR
(`gh pr edit --title`). The `PR title sync` workflow corrects drift, but it
is a backstop — don't rely on it.
