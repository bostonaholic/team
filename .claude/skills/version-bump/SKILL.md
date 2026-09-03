---
name: version-bump
description: |
  Version the Team plugin at land time (DEV-internal, not distributed): decide
  the SemVer level, compute the next free version against current `main`, update
  all six version strings, cut the `[Unreleased]` changelog body into a dated
  `## [X.Y.Z]` section, run the land-time consistency assertion, and commit
  `chore(version): X.Y.Z`. This is the Team-internal bumper; the generic runtime
  `/shipit` skill then pushes, waits for CI, and squash-merges. Invoke ONLY on
  explicit land intent — the user says "ship it", "land the PR", "bump the
  version", "version this PR", or a `/shipit` is already in flight. Never infer
  land intent from work merely being finished, reviewed, green, or ready to open
  a draft PR: a drafted PR carries no version, and a bump made before land time
  is stale by the time the PR merges.
---

# Version Bump — version a Team PR at land time

> Follow `skills/principle-progress-tracking/SKILL.md`: this procedure has more than two steps —
> seed one todo item per step below before starting and mark each complete as you go.

This skill versions the **Team plugin itself** at land time. It is **dev-only**
(lives under `.claude/`, never distributed to plugin users). Tagging and the
GitHub release are **not** part of this procedure — `release-on-merge.yml` does
both automatically when the PR merges. Full policy:
[docs/versioning.md](../../../docs/versioning.md).

## The dev land process

Landing a Team PR is two steps, in order:

1. **Bump (this skill).** Run `version-bump` against current `main`. It picks the
   level, assigns the next free version, and bumps the six version strings. It
   cuts the `[Unreleased]` changelog into a dated `## [X.Y.Z]` section, runs the
   land-time consistency assertion, and commits `chore(version): X.Y.Z`.
2. **Land (the generic `/shipit` skill).** Run the distributed runtime
   [`/shipit`](../../../skills/shipit/SKILL.md) skill to push the branch, wait
   for CI, and squash-merge. `shipit` is project-agnostic — it does no
   versioning. This skill is the Team-internal bumper it composes with.

Run this skill **before** `/shipit`, against the version of `main` you intend to
land onto.

## Precondition — explicit land intent

Everything below is irreversible-ish work on a shared number: it rewrites six
version strings, moves the `[Unreleased]` changelog body into a dated section,
retitles the PR, and commits. All of it is computed against **the base
branch's tip at this moment**, so a bump made any earlier than the land is
stale the moment another PR merges — and the pre-merge guard then denies the
merge until someone recomputes it. Deferring to land time is what keeps the
number correct.

**This skill fires only on explicit land intent**, meaning one of:

- The user asked to land: "ship it", "land the PR", "land this", `/shipit`.
- The user asked for the bump itself: "bump the version", "version this PR".
- A `/shipit` run is already in flight and reached its versioning step.

**Never infer land intent.** None of the following is a cue to bump:

- The work is finished, the review passed, or CI is green.
- A draft PR is about to be opened, or was just opened. A drafted PR carries
  **no** version by design — the bullet goes under `## [Unreleased]` and
  nothing else moves.
- The invariant script exited 1. That exit states a precondition for
  *merging*, and it is the expected state for a runtime PR's whole review
  lifetime. It is not a request to bump now.

With no land intent, **stop and say so.** Report that the branch will need a
bump before it can merge, and wait for the user. Do not bump "to be helpful".

**The bump is conditional, not universal.** Step 0 below decides if this PR
warrants a bump at all. Only PRs that change the **distributed plugin** bump. A
dev-only PR (CI, docs, tests, evals, `.claude/` tooling) lands with no bump and
no changelog cut. Run step 0, see it say "no bump", and go straight to `/shipit`
with the plain conventional title.

## Steps

### 0. Runtime-vs-dev gate — does this PR warrant a bump at all?

**Run this before everything else. Most steps below only apply if it says yes.**
It answers *does this PR warrant a bump*, never *is now the right time* — the
land-intent precondition above already settled the timing, and a yes here does
not reopen it.

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

1. Resolve the default branch by asking GitHub (`gh repo view`), falling
   back to the local `origin/HEAD` ref — the same order the pre-merge guard
   uses: GitHub is authoritative, and the local ref goes stale on an
   upstream default-branch rename. Never a guessed `main`, which could
   measure against the wrong base. If both fail, stop: no verdict.
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
DEFAULT=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name 2>/dev/null)
DEFAULT=${DEFAULT:-$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|^refs/remotes/origin/||')}
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
  conventional title (`<type>: <subject>`). On a re-entry whose PR title
  still carries a stale `vX.Y.Z` prefix from an earlier bump, strip it now
  (`gh pr edit --title`) — the title backstop never strips a stale prefix,
  and this is the one step-8 action a no-bump exit still owes (the wrongful-
  bump recovery in docs/versioning.md lands here). Precedent: `710d44c`
  (CI), `7d2e218` (docs), `0821129` (evals `feat:`) all landed plain. Then go
  straight to `/shipit`. This exit **requires** that OK line — the quick look
  alone never authorizes it.
- Exit 0, stdout starting `OK: runtime_changed=true bumped=true` → already
  bumped (a recovery re-entry). Never re-bump — proceed to `/shipit`.
- Exit 1, verdict containing `cannot merge until version-bump runs at land time`
  → bump warranted. Reaching this line means the land-intent precondition
  already passed, which is the only reason the verdict is actionable here;
  read outside a land it states a merge precondition and nothing more.
  - On a branch with **no** `chore(version)` commit: **continue to step 1**.
    This signal reports an unmet merge precondition on a branch that has not
    bumped, which is exactly the state step 1 exists to change. Every other
    exit-1 verdict in this list stops.
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

#### What SemVer actually says

[SemVer 2.0.0](https://semver.org/spec/v2.0.0.html), quoted verbatim. Note the
scope column — **items 6, 7, and 8 each carry an `x > 0` precondition:**

| Item | Normative rule | Scope |
|------|----------------|-------|
| 6 | PATCH "MUST be incremented if only backward compatible bug fixes are introduced. A bug fix is defined as an internal change that fixes incorrect behavior." | `x.y.Z \| x > 0` |
| 7 | MINOR "MUST be incremented if new, backward compatible functionality is introduced to the public API." | `x.Y.z \| x > 0` |
| 8 | MAJOR "MUST be incremented if any backward incompatible changes are introduced to the public API." | `X.y.z \| X > 0` |

Team's version starts `0.`, so **not one of those three rules binds.** Item 4
governs instead: "Major version zero (`0.y.z`) is for initial development.
Anything MAY change at any time. The public API SHOULD NOT be considered
stable." The spec assigns **no level at all** pre-1.0, which is why the rule
below is Team's own convention — chosen so it keeps meaning the same thing once
1.0.0 arrives. Item 5: "Version 1.0.0 defines the public API."

#### The decision

Ask these in order. **The first yes wins.** Judge the *change*, never the
commit subject:

1. **Can a plugin user observe the difference?** → **minor**

   A user installs Team and runs its commands. Anything that changes what they
   type, what they get back, or what the plugin does on their behalf is
   observable: a command's name or arguments (`argument-hint`), documented
   behavior, whether a step prompts them, an artifact's format or frontmatter
   schema, hook behavior, an agent's model or tool access. New capability and
   changed capability both land here.

2. **Otherwise** → **patch**

   Internal-only and backward compatible: prose that clarifies without changing
   an instruction, a comment, restructuring that preserves behavior. This is
   item 6's definition — "an internal change that fixes incorrect behavior" —
   and it requires *both* qualifiers, not just a `fix:` subject.

   **Expect patch to be rare.** Team ships prose that a model reads, so a
   runtime edit usually changes what the plugin does, and question 1 catches it.
   That is the intended consequence of this rule, not evidence it is
   miscalibrated — do not widen patch to make the cadence feel familiar.

**`major` is unreachable while the version starts `0.`** Item 8 is scoped
`X > 0`, and 1.0.0 is the release that "defines the public API" (item 5). A
breaking change pre-1.0 is a **minor**, not a major: bumping to 1.0.0 to
describe one broken interface would commit the whole plugin to API stability,
which is a far larger claim than the change makes. If a change looks like it
warrants major, that is a signal to **ask whether it is time to declare 1.0.0**
— a deliberate decision, never a side effect of this skill.

#### The commit type is not the input

A conventional-commit type describes the author's intent, not the blast radius,
so it never decides the level. A `fix:` that changes observable behavior is a
**minor**; a `feat:` confined to internals is a **patch**. Step 0 has already
settled *whether* to bump, so a `ci:`/`test:`/`docs:`/`chore:` commit shipping
no runtime change never reaches this decision at all.

**Worked example — [PR #228](https://github.com/bostonaholic/team/pull/228),
which this rule exists to get right.** `fix(shipit): merge without stopping for
approval` removed the `--yes` argument and removed the pre-merge confirmation.
Question 1: a user who typed `/shipit` stopped being asked to confirm, and a
documented argument disappeared — observable. **minor** (0.43.2 → 0.44.0). The
`fix:` subject is irrelevant, and the removed argument does not make it a major
while Team is pre-1.0.

State the chosen level and which question decided it. Both levels are reachable
from any commit type, so a level that needed a judgment call is a signal the
observability question above was not actually answered — answer it rather than
asking the user.

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

### 3. Bump all six version strings

The version lives in **six places across five files**:

| File | Occurrences |
|------|-------------|
| `.claude-plugin/plugin.json` | 1 (`version`) |
| `.claude-plugin/marketplace.json` | 2 (`metadata.version` **and** `plugins[0].version`) |
| `.codex-plugin/plugin.json` | 1 (`version`) |
| `package.json` | 1 (`version`) |
| `plugin.json` (repo root) | 1 (`version`): what Antigravity reports |

Codex reads `.codex-plugin/plugin.json` in preference to the Claude manifest,
and shows the version it finds there. A stale one makes the same release look
like two different versions depending on the host. Antigravity reads the root
`plugin.json`, which sits at the root rather than in a directory of its own
because that host resolves `skills/` and `agents/` as siblings of its manifest.

Edit all five files, then prove it:

```bash
grep -rn '"version"' package.json plugin.json .claude-plugin/plugin.json \
  .claude-plugin/marketplace.json .codex-plugin/plugin.json
```

All six lines must show the **new** version. Zero may still show the old one.

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
node -e "['.claude-plugin/plugin.json','.claude-plugin/marketplace.json','.codex-plugin/plugin.json','.agents/plugins/marketplace.json','plugin.json','package.json'].forEach(f=>JSON.parse(require('fs').readFileSync(f)));console.log('JSON OK')"
```

The tripwire asserts strict semver, that all six strings agree, and that the
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
  .codex-plugin/plugin.json plugin.json package.json CHANGELOG.md
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
