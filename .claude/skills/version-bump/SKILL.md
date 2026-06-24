---
name: version-bump
description: |
  Version the Team plugin at land time (DEV-internal, not distributed): decide
  the SemVer level, compute the next free version against current `main`, update
  all four version strings, cut the `[Unreleased]` changelog body into a dated
  `## [X.Y.Z]` section, run the land-time consistency assertion, and commit
  `chore(version): X.Y.Z`. This is the Team-internal bumper; the generic runtime
  `/shipit` skill then pushes, waits for CI, and squash-merges. Use when landing
  a Team PR, or when the user asks to "bump the version" or "version this PR".
---

# Version Bump — version a Team PR at land time

> Follow `skills/progress-tracking/SKILL.md`: this procedure has more than two steps —
> seed one todo item per step below before starting and mark each complete as you go.

This skill versions the **Team plugin itself** at land time. It is **dev-only**
(lives under `.claude/`, never distributed to plugin users). Tagging and the
GitHub release are **not** part of this procedure — `release-on-merge.yml` does
both automatically when the PR merges. Full policy:
[docs/versioning.md](../../../docs/versioning.md).

## The dev land process

Landing a Team PR is two steps, in order:

1. **Bump (this skill).** Run `version-bump` against current `main`: it picks the
   level, assigns the next free version, bumps the four version strings, cuts the
   `[Unreleased]` changelog into a dated `## [X.Y.Z]` section, runs the land-time
   consistency assertion, and commits `chore(version): X.Y.Z`.
2. **Land (the generic `/shipit` skill).** Run the distributed runtime
   [`/shipit`](../../../skills/shipit/SKILL.md) skill to push the branch, wait for
   CI, and squash-merge. `shipit` is project-agnostic — it does no versioning;
   this skill is the Team-internal bumper it composes with.

Run this skill **before** `/shipit`, against the version of `main` you intend to
land onto.

**The bump is conditional, not universal.** Step 0 below decides whether this PR
warrants a bump at all: only PRs that change the **distributed plugin** bump.
A dev-only PR (CI, docs, tests, evals, `.claude/` tooling) lands with no bump and
no changelog cut — run step 0, see it say "no bump", and go straight to `/shipit`
with the plain conventional title.

## Steps

### 0. Runtime-vs-dev gate — does this PR warrant a bump at all?

**Run this before everything else. Most steps below only apply if it says yes.**

The version, changelog, and GitHub release exist for **plugin end users** —
people who install Team and run `/team`. They are driven *only* by changes to the
**distributed plugin**. Contributor-facing / plugin-developer infrastructure does
not move the version, no matter what conventional-commit type it carries.

Using the **Runtime vs. Development** split in `CLAUDE.md`:

- **Runtime (bump-worthy):** `agents/`, `skills/`, `hooks/`, and
  `.claude-plugin/` *content* (a real change to the manifest, not the bare
  `"version"` field).
- **Development (never bumps):** `.github/`, `.claude/`, `docs/`, `tests/`,
  `evals/`, `package.json`/`bun.lock` tooling — everything that only validates or
  builds the plugin.

Check what this PR actually changed:

```bash
.github/scripts/version-bump-required.sh   # HEAD_SHA/BASE_SHA from the PR; deterministic gate
# or, locally, just look:
git diff origin/main...HEAD --name-only
```

- **No runtime files changed → DO NOT BUMP.** Skip every step below. Leave the
  version untouched, do **not** cut the changelog, and land with the plain
  conventional title (`<type>: <subject>`). Precedent: `710d44c` (CI), `7d2e218`
  (docs), `0821129` (evals `feat:`) all landed plain. Then go straight to
  `/shipit`.
- **Runtime files changed → continue to step 1.**

This is a hard gate, not a judgment call: the same check runs deterministically in
CI (`.github/scripts/version-bump-required.sh`, pinned by
`tests/version-bump-required.test.ts`) and **fails the PR** if a dev-only diff
bumped, or a runtime diff did not.

### 1. Decide the bump level

> Reached **only when step 0 said a bump is warranted** (the PR changed runtime
> files). The level question is never "does this bump?" — step 0 already
> answered that — only "how big is the bump?"

```bash
git log origin/main..HEAD --oneline
git diff origin/main...HEAD --stat
```

Pick the highest-impact **runtime** change in the PR:

- **major** — breaking change to the plugin's contract (commands, artifact formats, hook behavior).
- **minor** — new backward-compatible capability (`feat:`).
- **patch** — everything else (`fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`).

The conventional-commit type only picks the *level*; it never overrides step 0.
A `ci:`/`test:`/`docs:`/`chore:` commit that ships **no runtime change** never
reaches this table — it already stopped at step 0 with no bump.

State the chosen level and the reasoning. If genuinely ambiguous, ask.

### 2. Compute the next version

```bash
bash .claude/scripts/next-version.sh <level>
```

This prints `bump(<default branch>'s version, level)` — **deterministic**, a
pure function of the base and the level, with no open-PR scan. The base is read
from the remote's default branch (resolved via `origin/HEAD`, not a hardcoded
`main`). Under the land-time
model the version is assigned against current `main` and landing is serialized,
so `bump(main, level)` is always free; a concurrent race is handled by `/shipit`
(rebase + recompute) and `release-on-merge.yml`'s duplicate-tag backstop.

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

### 4. Cut the changelog section

This **moves** the accumulated `[Unreleased]` body into a new dated section —
the inverse of `release-on-merge.yml`'s `awk` extraction (you write the section
the release workflow later reads). In `CHANGELOG.md` (Keep a Changelog format,
entry style per `skills/changelog/SKILL.md`):

- Move the entire `[Unreleased]` body into a new `## [X.Y.Z] - YYYY-MM-DD`
  (today's date) section inserted directly **below** `## [Unreleased]`. Leave
  `## [Unreleased]` in place, now empty again.
- Re-point the link-reference footer:
  - `[Unreleased]` compare base → `vX.Y.Z...HEAD`
  - Add `[X.Y.Z]: https://github.com/bostonaholic/team/compare/v<prev>...vX.Y.Z`

This section becomes the GitHub release notes verbatim — write it for a reader
deciding whether to upgrade. Any links must be **absolute URLs**: relative paths
(e.g. `docs/versioning.md`) render as dead links on the release page (see
`skills/changelog/SKILL.md`).

**Empty-`[Unreleased]` edge case.** An empty `[Unreleased]` on a PR that reached
this step (it passed step 0, so it *did* change runtime files) means the
user-facing bullet was simply never written. **Derive at least one bullet from
the PR's runtime commits** (`feat:`/`fix:`/`perf:`/`security:` per
`skills/changelog/SKILL.md` style). Never write an empty section
(`release-on-merge.yml` errors on empty release notes).

Empty `[Unreleased]` **and** no runtime change is not this case — that PR should
have stopped at **step 0** with no bump and no changelog cut. Do not invent a
bullet to justify a bump that step 0 already declined; go back and land plain.

### 5. Land-time consistency assertion

After the changelog cut and **before committing**, run the consistency check —
it must run **after** the cut (so the dated section exists to validate). This is
the in-tree replacement for the retired `version-gate.yml`:

```bash
bun test tests/version-consistency.test.ts
node -e "['.claude-plugin/plugin.json','.claude-plugin/marketplace.json','package.json'].forEach(f=>JSON.parse(require('fs').readFileSync(f)));console.log('JSON OK')"
```

The tripwire asserts strict semver and that all four strings agree. Additionally
assert inline the released-section + footer-compare-link invariants (these hold
only after the cut, so they live here, not in the tripwire):

```bash
V=$(jq -r .version .claude-plugin/plugin.json)
ESC=$(sed 's/\./\\./g' <<<"$V")
grep -qE "^## \[$ESC\] - [0-9]{4}-[0-9]{2}-[0-9]{2}$" CHANGELOG.md \
  || { echo "::error::no '## [$V] - YYYY-MM-DD' section — the cut did not land"; exit 1; }
grep -qE "^\[$ESC\]: https://" CHANGELOG.md \
  || { echo "::error::no footer compare link for $V"; exit 1; }
grep -q "\[Unreleased\]: https://github.com/bostonaholic/team/compare/v$V...HEAD" CHANGELOG.md \
  || { echo "::error::[Unreleased] footer does not compare from v$V"; exit 1; }
echo "OK: land-time consistency holds"
```

If any check fails, **stop before committing** and fix the cut.

### 6. Commit

Commit the bump as its own commit in the PR branch, for clean reverts:

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json package.json CHANGELOG.md
git commit -m "chore(version): X.Y.Z"
```

### 7. Title the PR

`vX.Y.Z <type>: <subject>` — e.g. `v0.6.0 feat: add the shipit land skill`. Set
it on the existing PR (`gh pr edit --title`). The `PR title sync` workflow
corrects drift, but it is a backstop — don't rely on it.

Then run `/shipit` (step 2 of the dev land process) to push, wait for CI, and
squash-merge.
