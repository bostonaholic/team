---
name: version-bump
description: |
  Version the Team plugin at land time (DEV-internal, not distributed): decide
  the SemVer level, compute the next free version against current `main`, update
  all five version strings, cut the `[Unreleased]` changelog body into a dated
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

1. **Bump (this skill).** Run `version-bump` against current `main`. It picks the
   level, assigns the next free version, and bumps the five version strings. It
   cuts the `[Unreleased]` changelog into a dated `## [X.Y.Z]` section, runs the
   land-time consistency assertion, and commits `chore(version): X.Y.Z`.
2. **Land (the generic `/shipit` skill).** Run the distributed runtime
   [`/shipit`](../../../skills/shipit/SKILL.md) skill to push the branch, wait
   for CI, and squash-merge. `shipit` is project-agnostic — it does no
   versioning. This skill is the Team-internal bumper it composes with.

Run this skill **before** `/shipit`, against the version of `main` you intend to
land onto.

**The bump is conditional, not universal.** Step 0 below decides if this PR
warrants a bump at all. Only PRs that change the **distributed plugin** bump. A
dev-only PR (CI, docs, tests, evals, `.claude/` tooling) lands with no bump and
no changelog cut. Run step 0, see it say "no bump", and go straight to `/shipit`
with the plain conventional title.

## Steps

### 0. Runtime-vs-dev gate — does this PR warrant a bump at all?

**Run this before everything else. Most steps below only apply if it says yes.**

The version, changelog, and GitHub release exist for **plugin end users** —
people who install Team and run `/team`. They are driven *only* by changes to the
**distributed plugin**. Contributor-facing / plugin-developer infrastructure does
not move the version, no matter what conventional-commit type it carries.

Using the **Runtime vs. Development** split in `CLAUDE.md`:

- **Runtime (bump-worthy):** `agents/`, `skills/`, `hooks/`, and host manifest
  *content* — `.claude-plugin/`, `.codex-plugin/`, `.agents/plugins/` — meaning
  a real change to a manifest, not the bare `"version"` field. Every host's
  manifest ships to that host's end users, so a Codex-only manifest change is
  as much a runtime change as a Claude Code one.
- **Development (never bumps):** `.github/`, `.claude/`, `docs/`, `tests/`,
  `evals/`, `package.json`/`bun.lock` tooling — everything that only validates or
  builds the plugin.

Take a quick orientation look at what this PR actually changed:

```bash
git diff origin/main...HEAD --name-only
```

The quick look is orientation only — it never decides the exit. The decision
comes from **the invariant run**, the same invocation contract the pre-merge
guard enforces at merge time:

1. Resolve the default branch through `origin/HEAD`, falling back to asking
   GitHub (`gh repo view`) — the same order the pre-merge guard uses, and
   never a guessed `main`, which could measure against the wrong base. If
   both fail, stop: no verdict.
2. `git fetch origin <default>` — the fetch must succeed. Never degrade to a
   stale base for a verdict.
3. Up-to-date precondition: the fetched `origin/<default>` tip must be an
   ancestor of the branch tip. If the branch is behind, **stop**: rebase onto
   `origin/<default>` and re-enter step 0 — a rebase can change both verdict
   inputs.
4. Run the script with `HEAD_SHA` = the local branch tip and `BASE_SHA` = the
   fetched `origin/<default>` **tip** — the tip, never a pre-computed
   merge-base, and never a hand-rolled two-dot diff (the script reduces the
   pair to the fork point itself).

```bash
DEFAULT=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|^refs/remotes/origin/||')
DEFAULT=${DEFAULT:-$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name 2>/dev/null)}
[ -n "$DEFAULT" ] || { echo "cannot resolve the default branch — no verdict"; exit 1; }
git fetch origin "$DEFAULT" || { echo "fetch failed — no verdict"; exit 1; }
git merge-base --is-ancestor "refs/remotes/origin/$DEFAULT" HEAD \
  || { echo "behind base — rebase onto origin/$DEFAULT, re-enter step 0"; exit 1; }
HEAD_SHA=$(git rev-parse HEAD) BASE_SHA=$(git rev-parse "refs/remotes/origin/$DEFAULT") \
  .github/scripts/version-bump-required.sh
```

**Read the outcome by exact output match — the signal rule, default-deny:**

- Exit 0, stdout starting `OK: runtime_changed=false bumped=false` → dev-only
  and final. **DO NOT BUMP.** Skip every step below. Leave the version
  untouched, do **not** cut the changelog, and land with the plain
  conventional title (`<type>: <subject>`). Precedent: `710d44c` (CI),
  `7d2e218` (docs), `0821129` (evals `feat:`) all landed plain. Then go
  straight to `/shipit`. This exit **requires** that OK line — the quick look
  alone never authorizes it.
- Exit 0, stdout starting `OK: runtime_changed=true bumped=true` → already
  bumped (a recovery re-entry). Never re-bump — proceed to `/shipit`.
- Exit 1, verdict ending `Run version-bump.` → bump warranted.
  - On a branch with **no** `chore(version)` commit: **continue to step 1**.
    This is the only exit-1 signal that ever means continue.
  - On a branch **already carrying** a `chore(version)` commit: the bump went
    stale (a rebase moved the fork point). Stop — drop the bump commit, undo
    the changelog cut, reset the title, and re-enter step 0.
- Exit 1, verdict containing `must land with no bump` → wrongful bump. Stop —
  drop the commit, undo the cut, and re-run step 0.
- **Anything else** — a non-semver version, a merge-base or diff failure, or
  unrecognized output — stops in both directions. Surface the message
  verbatim. A hard script error never means "keep going".

This is a hard gate, not a judgment call. The check runs early here (this step
and step 7, while recovery is still purely local) and is enforced mechanically
at merge time by the dev pre-merge guard
(`.claude/hooks/pre-merge-guard.mjs`), which denies a `gh pr merge` on either
violation: a dev-only diff that bumped, or a runtime diff that did not. The
script itself stays pinned by `tests/version-bump-required.test.ts`.

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

The conventional-commit type only picks the *level*. It never overrides step 0. A
`ci:`/`test:`/`docs:`/`chore:` commit that ships **no runtime change** never
reaches this table — it already stopped at step 0 with no bump.

State the chosen level and the reasoning. If genuinely ambiguous, ask.

### 2. Compute the next version

```bash
bash .claude/scripts/next-version.sh <level>
```

This prints `bump(<default branch>'s version, level)` — **deterministic**, a pure
function of the base and the level, with no open-PR scan. The base is read from
the remote's default branch (resolved through `origin/HEAD`, not a hardcoded
`main`). Under the land-time model the version is assigned against current `main`
and landing is serialized, so `bump(main, level)` is always free. A concurrent
race resolves at merge time: `/shipit` rebases the branch, the pre-merge guard
denies the now-stale bump, and the recovery (step 0's stale-bump signal)
recomputes. `release-on-merge.yml`'s duplicate-tag rejection backstops the rest.

### 3. Bump all five version strings

The version lives in **five places across four files**:

| File | Occurrences |
|------|-------------|
| `.claude-plugin/plugin.json` | 1 (`version`) |
| `.claude-plugin/marketplace.json` | 2 (`metadata.version` **and** `plugins[0].version`) |
| `.codex-plugin/plugin.json` | 1 (`version`) |
| `package.json` | 1 (`version`) |

Codex reads `.codex-plugin/plugin.json` in preference to the Claude manifest,
and shows the version it finds there. A stale one makes the same release look
like two different versions depending on the host.

Edit all four files, then prove it:

```bash
grep -rn '"version"' package.json .claude-plugin/plugin.json \
  .claude-plugin/marketplace.json .codex-plugin/plugin.json
```

All five lines must show the **new** version. Zero may still show the old one.

### 4. Cut the changelog section

This **moves** the accumulated `[Unreleased]` body into a new dated section. It
is the inverse of `release-on-merge.yml`'s `awk` extraction, because you write
the section the release workflow later reads. In `CHANGELOG.md` (Keep a Changelog
format, entry style per `skills/changelog/SKILL.md`):

- Move the entire `[Unreleased]` body into a new `## [X.Y.Z] - YYYY-MM-DD`
  (today's date) section inserted directly **below** `## [Unreleased]`. Leave
  `## [Unreleased]` in place, now empty again.
- Re-point the link-reference footer:
  - `[Unreleased]` compare base → `vX.Y.Z...HEAD`
  - Add `[X.Y.Z]: https://github.com/bostonaholic/team/compare/v<prev>...vX.Y.Z`

This section becomes the GitHub release notes verbatim — write it for a reader
deciding if the upgrade is worth it. Any links must be **absolute URLs**: relative paths (e.g.
`docs/versioning.md`) render as dead links on the release page (see
`skills/changelog/SKILL.md`).

**Empty-`[Unreleased]` edge case.** A PR that reached this step passed step 0, so
it *did* change runtime files. An empty `[Unreleased]` on it means nobody wrote
the user-facing bullet.
**Derive at least one bullet from the PR's runtime commits**
(`feat:`/`fix:`/`perf:`/`security:` per `skills/changelog/SKILL.md` style). Never
write an empty section (`release-on-merge.yml` errors on empty release notes).

Empty `[Unreleased]` **and** no runtime change is not this case. That PR must
have stopped at **step 0**, with no bump and no changelog cut. Do not invent a
bullet to justify a bump that step 0 already declined. Go back and land plain.

### 5. Land-time consistency assertion

After the changelog cut and **before committing**, run the consistency check —
it must run **after** the cut (so the dated section exists to validate). This is
the in-tree replacement for the retired `version-gate.yml`:

```bash
bun test tests/version-consistency.test.ts
node -e "['.claude-plugin/plugin.json','.claude-plugin/marketplace.json','.codex-plugin/plugin.json','.agents/plugins/marketplace.json','package.json'].forEach(f=>JSON.parse(require('fs').readFileSync(f)));console.log('JSON OK')"
```

The tripwire asserts strict semver, that all five strings agree, and that the
host manifests agree on the plugin and marketplace names. Additionally
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
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json \
  .codex-plugin/plugin.json package.json CHANGELOG.md
git commit -m "chore(version): X.Y.Z"
```

### 7. Assert the bump invariant

Re-run the invariant run from step 0 — the head is now the branch tip carrying
the `chore(version)` commit. Require exit 0 with stdout starting
`OK: runtime_changed=true bumped=true`.

This runs **before any remote change** (the title edit in step 8 is remote).
On any other outcome, stop: drop the `chore(version)` commit, undo the
changelog cut, and land plain — nothing has left the machine, so the recovery
is purely local.

### 8. Title the PR

`vX.Y.Z <type>: <subject>` — e.g. `v0.6.0 feat: add the shipit land skill`. Set
it on the existing PR (`gh pr edit --title`). The `PR title sync` workflow
corrects drift, but it is a backstop — do not rely on it.

A re-entry path that runs after a title already exists must reset it: the
stale-bump recovery re-titles with the recomputed version, and a re-entry that
ends at "no bump" strips the `vX.Y.Z` prefix explicitly — the title backstop
never strips a stale prefix.

Then run `/shipit` (step 2 of the dev land process) to push, wait for CI, and
squash-merge.
