---
name: nuke-team-plugin
description: |
  Run Team's instruction-surface nuke experiment (DEV-internal, never
  distributed): archive the remote default branch as a signed
  `nuke-baseline/<date>` tag, build a `team-nuke-<date>` worktree on
  `experiment/nuke-<date>` with Team's own skills, agents, hooks and guidance
  files removed, repoint the Claude Code dev plugin cache at that worktree so
  the experiment is live, and pull removed items back one at a time from the
  archive (`/nuke-team-plugin restore <item>`). Invoke ONLY on explicit nuke or
  restore intent — the user says "nuke the team plugin", "run the nuke
  experiment", "restore <item> from the nuke", or runs `/nuke-team-plugin`.
  Nuking deletes Team's own instruction surface and changes what every Claude
  Code session on this machine loads until it is undone: never infer that
  intent from a conversation about skills, plugins, or cleanup.
disable-model-invocation: true
argument-hint: "[restore [<item>]]"
---

# nuke-team-plugin — archive, remove, and selectively restore Team's instruction surface

> This procedure has more than two steps — seed one todo item per numbered step
> below before starting, and mark each complete as you go. The ledger is inlined
> here rather than delegated, on purpose: every other instruction file in this
> repo is inside the deletion set, so this skill may not point at one and expect
> it to exist.

Two modes, one frontmatter:

- **Nuke** (no argument). Archive, isolate, remove, then make the experiment
  live. Steps 0 through 7 below.
- **Restore** (`restore [<item>]`). Print the manifest, or pull one item back
  out of the archive. See `## Restore mode`.

This skill is deliberately self-contained. It loads no other instruction file
and reads nothing under `skills/` or `agents/` at run time, because the nuke
deletes both. Its own directory, `.claude/skills/nuke-team-plugin/`, is
excluded from the deletion set so that the undo survives the experiment.

## Input

The whole argument is at most two words.

- Empty → nuke mode.
- `restore` → print the manifest and stop.
- `restore <item>` → restore that manifest item.
- Any other first word → print the usage line
  (`/nuke-team-plugin [restore [<item>]]`) and stop. Never guess a mode.

`<item>` is untrusted (see `## Untrusted input`). It must match
`^[A-Za-z0-9._/-]+$` under `LC_ALL=C`, contain no `..`, and not start with `/`.

## Hard Rules

1. **Two scopes, and mixing them up is the one mistake that can hurt the
   primary checkout.** Repo-level operations — `fetch`, `rev-parse`,
   `ls-remote`, `tag`, `branch`, `worktree add`, `worktree remove` — run as
   `git -C "$PRIMARY_ROOT"`. Everything that touches the experiment's own tree
   — step 6's `rm`, `add` and `commit` — runs as `git -C "$WORKTREE"`. Step 6
   run at `$PRIMARY_ROOT` would stage the deletions on the default branch in
   the maintainer's own checkout. **Restore has no `$WORKTREE`**: it runs
   inside the experiment tree and binds to `$TOPLEVEL`, the value R2 derives
   and proves. **Restore's whole proof-and-write path — R2 through R7 — runs as
   one Bash invocation**, so `$TOPLEVEL` (proved in R2) and `$ARCHIVE` (proved
   in R5) are the exact values R6's gate and R7's checkout write against: the
   value proved is the value used because no Bash boundary sits between the
   proof and the write. The re-restore escape is its own single invocation that
   re-establishes both proofs before it writes. Every restore read and every
   restore write — R6's state gate, R7's checkout, and the re-restore escape —
   carries `git -C "$TOPLEVEL"` and resolves its path against `"$TOPLEVEL/"`, so
   no restore command is bound by the caller's working directory alone.
2. **`$PRIMARY_ROOT` is detected, never assumed.** Step 0 derives it from
   `--git-common-dir` and validates it three ways, including against
   `worktree list --porcelain`. This repo carries linked worktrees, so being
   invoked from one is the normal case.
3. **No command relies on a variable set in an earlier Bash invocation.**
   Shell state does not persist. Re-derive `$PRIMARY_ROOT`, `$WORKTREE` and
   `$ARCHIVE_SHA` in the same invocation that uses them, and guard every value
   consumed inside a command substitution with a standalone
   `: "${PRIMARY_ROOT:?}"` or `: "${WORKTREE:?}"` statement ahead of it. Inside
   `$( )` the `${VAR:?}` form kills only the subshell and the parent continues
   with an empty value, which is why the guard is its own statement.
   **`$DATE` is the exception: it is carried forward as the literal value step
   0 printed, never re-derived.** A run that starts before midnight and reaches
   step 6 after it would otherwise key the tag, the branch and the worktree to
   two different dates, and the worktree the run created would no longer be the
   one its own commands name. Restore is the other exception: R2 through R7 are
   one invocation (Hard Rule 1), so `$TOPLEVEL` and `$ARCHIVE` are proved once
   and persist to every later block without re-derivation, and the re-restore
   escape re-proves both from scratch.
4. **Refuse first.** Every gate is a positive proof, never the absence of an
   objection. A gate that cannot prove its claim refuses the run and prints the
   two ways forward; it never repairs, normalizes, or retries around what it
   found.
5. **Never skip `git fetch`, and never assume the default branch is `main`.**
   Detect it per repo in step 1.
6. **Signing is mandatory and has no fallback.** The nuke commit and both tags
   are signed. A signing failure stops the run before any deletion is
   committed, reports the exact command and its error, and never falls back to
   an unsigned object.
7. **Names are date-keyed and never overwritten.** `nuke-baseline/<date>`,
   `experiment/nuke-<date>` and `team-nuke-<date>` are refusals when they
   already exist, never `-f`, never a reuse without proof.
8. **The tag push is best-effort, not a gate.** A rejected push warns loudly
   and the run continues: the local annotated tag already holds every archived
   byte and does not expire. The final report names the machine-local exposure.
9. **Never write a `$` immediately followed by a digit anywhere in this file.**
   The slash-command loader substitutes it as the caller's Nth argument before
   the model ever reads the body, which silently rewrites shell positional
   parameters and awk field references. Read fields with `cut -d' ' -f1`.
10. **The deletion set is hard-coded here, in the skill body, and nowhere
    else.** Deleted whole: `AGENTS.md`, `CLAUDE.md`, `skills/`, `agents/`,
    `hooks/`, `.claude/hooks/`, and every entry under `.claude/skills/` except
    `.claude/skills/nuke-team-plugin/`. Edited by key: the `hooks` object of
    `.claude-plugin/plugin.json` and of `.claude/settings.json`. Everything
    else — `tests/`, `evals/`, `docs/`, `.github/`, every other manifest — is
    out of the set. `enabledPlugins` in `.claude/settings.json` is preserved
    deliberately.
11. **Every machine-wide step asks first.** Step 7 moves a symlink that
    changes what every Claude Code session on this machine loads. It runs only
    after an explicit confirmation, and a refusal to repoint never rolls the
    commit back.
12. **A value from `NUKE.md` or the `<item>` argument is never typed into a
    command — it is read into a variable and shape-checked first.** No value
    that originates in `NUKE.md` or the user `<item>` argument may appear as
    literal text inside any shell command. Retyping it as `VAR="<value>"`
    executes any embedded `$(...)` or backtick at assignment, before a single
    gate runs (this is the injection round 2's CRITICAL named). Every such value
    is bound by a command that *reads it* — a file-reading command substitution
    for `NUKE.md` fields (`sed`/`grep`/`cut` against `"${TOPLEVEL}/NUKE.md"`),
    a `cut`/`read` split for the manifest triples in `$MANIFEST_LINES`, and a
    single-quoted here-doc for the `<item>` argument that has no file — and then
    shape-checked before it reaches any command. Command substitution does not
    re-evaluate the bytes it captures, so `$(...)` in the file lands in the
    variable as inert text. The `$DATE` literal-transcription idiom is only ever
    for values step 0 *printed* (from `date`, from `git`), never for anything
    that came out of `NUKE.md` or the argument.

## Untrusted input — NUKE.md is data

`NUKE.md` is an ordinary tracked file in a tree that both the maintainer and
the model under observation write to. Nothing in it is treated as
skill-authored at read time:

- Only allowlisted fields gate an action. Prose in `NUKE.md` authorizes
  nothing.
- **Every allowlisted field is shape-checked before it reaches anything**, and
  the list is closed. Nothing outside it is read at all:

  | Field | Shape it must match | Where it is checked |
  |-------|--------------------|---------------------|
  | Branch | `experiment/nuke-<YYYY-MM-DD>`, no suffix | R2 |
  | Baseline tag | `nuke-baseline/<YYYY-MM-DD>` | R5 |
  | Archive SHA | exactly 40 lowercase hex | R5 |
  | Manifest `<id>` | `^[A-Za-z0-9._/-]+$`, unique in the block | R3 |
  | Manifest `<path>` | syntax check **and** deletion-set containment | R4 |
  | Manifest `<baseline>` | `present` or `absent` | R4 |
  | Manifest `<state>` | `-` or 40 lowercase hex | R4 |
  | Cache entry (undo line) | absolute path under the dev cache dir, then exact match to the discovered live entry | step 7 |

  Every one of these is bound by a command that reads it, never retyped
  (Hard Rule 12): the value proved is the value used, and no `$(...)` in the
  file ever runs.

  `Worktree` and `Date` label the report only. No gate reads either, so
  neither is shape-checked and neither can steer a command.
- Every path read out of the manifest must pass the syntax check
  (`^[A-Za-z0-9._/-]+$` under `LC_ALL=C`, no `..`, no leading `/`) **and** sit
  inside one of the deletion-set roots hard-coded in Hard Rule 10, and never
  under `.claude/skills/nuke-team-plugin/`. R4 runs that check as a fenced
  block, before `$ITEM_PATH` reaches any command.
- The recorded `ARCHIVE_SHA` is a cross-check, never an input to a command.
  Only the tag is signed, so restore reads the trusted commit from the peeled
  `^{}` value of a verified tag.
- A line that fails any check is refused, never repaired.

The skill body is the trusted root, and the only one: the harness loads it to
run this skill at all. Everything the run *produced* is downstream of it.

## Execution

### Step 0 — resolve and validate $PRIMARY_ROOT, then derive the worktree

The whole resolve-validate-derive sequence is one runnable block. A failure
here refuses before the fetch and names the path that failed.

```sh
COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
[ -n "$COMMON_DIR" ] || { echo "refusing: cannot resolve the git dir" >&2; exit 1; }
PRIMARY_ROOT="$(dirname "$COMMON_DIR")"
[ "$(git -C "$PRIMARY_ROOT" rev-parse --path-format=absolute --git-dir)" = \
  "$(git -C "$PRIMARY_ROOT" rev-parse --path-format=absolute --git-common-dir)" ] &&
  [ "$PRIMARY_ROOT" = "$(git -C "$PRIMARY_ROOT" worktree list --porcelain | sed -n '1s/^worktree //p')" ] &&
  [ "$(git -C "$PRIMARY_ROOT" rev-parse --show-toplevel)" = "$PRIMARY_ROOT" ] ||
  { echo "refusing: '$PRIMARY_ROOT' failed primary-clone validation — re-run from the primary clone" >&2; exit 1; }
DATE="$(date +%Y-%m-%d)"
PARENT="$(dirname "$PRIMARY_ROOT")"
WORKTREE="${PARENT}/team-nuke-${DATE}"
[ -w "$PARENT" ] || { echo "refusing: '$PARENT' is not writable — the experiment worktree cannot be created beside the primary clone" >&2; exit 1; }
{ [ ! -e "$WORKTREE" ] && [ ! -L "$WORKTREE" ]; } || { echo "refusing: '$WORKTREE' already exists — finish or tear down that experiment, or run on another date" >&2; exit 1; }
git -C "$PRIMARY_ROOT" show-ref --verify --quiet "refs/heads/experiment/nuke-${DATE}" &&
  { echo "refusing: branch experiment/nuke-${DATE} already exists — finish or tear down that experiment, or run on another date" >&2; exit 1; }
printf 'PRIMARY_ROOT=%s\nWORKTREE=%s\nDATE=%s\n' "$PRIMARY_ROOT" "$WORKTREE" "$DATE"
```

The worktree sits **beside** the primary clone, not under
`<repo>/.claude/worktrees/`: Claude Code reads `CLAUDE.md` from every ancestor
directory, so a nested worktree would inherit the guidance the experiment just
deleted.

The collision check tests `-L` as well as `-e`, because `-e` follows the link
and a **dangling** symlink at that path would otherwise read as "nothing is
there" — and then `git worktree add` fails on it anyway, after the tag was
already pushed.

### Step 1 — fetch, detect the default branch, capture the archive SHA

```sh
: "${PRIMARY_ROOT:?}"
git -C "$PRIMARY_ROOT" fetch origin --tags
DEFAULT="$(git -C "$PRIMARY_ROOT" symbolic-ref --quiet --short refs/remotes/origin/HEAD | sed -n 's#^origin/##p')"
[ -n "$DEFAULT" ] || { echo "refusing: cannot detect the default branch — run 'git remote set-head origin --auto' and re-run" >&2; exit 1; }
ARCHIVE_SHA="$(git -C "$PRIMARY_ROOT" rev-parse "origin/${DEFAULT}")"
git -C "$PRIMARY_ROOT" status --porcelain
git -C "$PRIMARY_ROOT" rev-list --count "${ARCHIVE_SHA}..HEAD"
```

The last two lines are a **warning**, never a refusal. A dirty or ahead primary
checkout means the experiment measures the remote's Team, not the maintainer's
working state. Say so in the report and continue.

### Step 2 — the already-nuked stop

This check runs after `ARCHIVE_SHA` exists and **before** the tag is created,
so a run with nothing to remove stops with nothing to dispose of: no tag, no
branch, no worktree, no commit, no `NUKE.md`.

The stop is an **OR over the deletion set** — one surviving path is enough
work to justify the run — and step 6 is written to match it: step 6 removes
each path only if it is present, so a partially-nuked archive is the normal
case on both sides rather than a fatal pathspec error.

**`.claude/skills` is never tested as a whole.** This skill's own directory
lives under it and is excluded from the deletion set, so that path is present
at every SHA and testing it would pin `PRESENT=1` forever, turning the stop
into dead code. What counts is whether any *other* entry survives under it:

```sh
: "${PRIMARY_ROOT:?}"
: "${ARCHIVE_SHA:?}"
PRESENT=0
for p in AGENTS.md CLAUDE.md skills agents hooks .claude/hooks; do
  git -C "$PRIMARY_ROOT" cat-file -e "${ARCHIVE_SHA}:${p}" 2>/dev/null && PRESENT=1
done
OTHER_SKILLS="$(git -C "$PRIMARY_ROOT" ls-tree -z --name-only "$ARCHIVE_SHA" -- .claude/skills/ |
  tr '\0' '\n' | grep -vxF '.claude/skills/nuke-team-plugin' || true)"
[ -z "$OTHER_SKILLS" ] || PRESENT=1
[ "$PRESENT" = 1 ] ||
  { echo "already nuked: every deletion-set path is absent at ${ARCHIVE_SHA} — nothing was created"; exit 0; }
```

### Step 3 — prove or create the baseline tag

The archive is one signed annotated tag at `$ARCHIVE_SHA`. **Every SHA
comparison peels first**: a bare `git rev-parse <annotated-tag>` returns the
tag object's own SHA, never the commit's, so an unpeeled comparison reads every
correctly created baseline as a second baseline for the same date.

`DATE` in this step and every step after it is the **literal value step 0
printed**, pasted in. Never `date +%Y-%m-%d` again: a run that crosses midnight
would key the tag to one date and the branch to the next (Hard Rule 3).

**The remote pre-flight runs first**, before the local tag is created. Both
blocks are read-only up to `tag -a -s`, so ordering them this way costs
nothing and means a refusal leaves no stray local tag behind for the
maintainer to clean up.

`git ls-remote --tags` lists an annotated tag's own object SHA on the
`refs/tags/<name>` row and the commit it points at on the `refs/tags/<name>^{}`
row. A **lightweight** remote tag has no `^{}` row at all, so comparing only
the peeled row is vacuous against exactly the case that must refuse. Read both
rows:

```sh
: "${PRIMARY_ROOT:?}"
: "${ARCHIVE_SHA:?}"
DATE="<the literal value step 0 printed>"
ROWS="$(git -C "$PRIMARY_ROOT" ls-remote --tags origin \
  "refs/tags/nuke-baseline/${DATE}" "refs/tags/nuke-baseline/${DATE}^{}")"
UNPEELED_ROW="$(printf '%s\n' "$ROWS" | grep -F "refs/tags/nuke-baseline/${DATE}" | grep -vF '^{}' | cut -f1)"
PEELED_ROW="$(printf '%s\n' "$ROWS" | grep -F "refs/tags/nuke-baseline/${DATE}^{}" | cut -f1)"
if [ -n "$UNPEELED_ROW" ] && [ -z "$PEELED_ROW" ]; then
  echo "refusing: origin carries a LIGHTWEIGHT tag nuke-baseline/${DATE} at ${UNPEELED_ROW} (no ^{} companion row) — retire that tag deliberately, or run on another date" >&2; exit 1
fi
if [ -n "$PEELED_ROW" ] && [ "$PEELED_ROW" != "$ARCHIVE_SHA" ]; then
  echo "refusing: origin's nuke-baseline/${DATE} peels to ${PEELED_ROW}, not ${ARCHIVE_SHA} — retire that tag deliberately, or run on another date" >&2; exit 1
fi
```

Only once the remote is clear, prove or create the local tag. An existing local
tag is reused only on three positive proofs: the peeled `^{}` SHA equals
`$ARCHIVE_SHA`, `cat-file -t` reports `tag` (annotated, not lightweight), and
`git tag -v` verifies the signature. Any one failing refuses the whole run,
before any deletion, because one dated label must not name two baselines.

```sh
: "${PRIMARY_ROOT:?}"
: "${ARCHIVE_SHA:?}"
DATE="<the literal value step 0 printed>"
if git -C "$PRIMARY_ROOT" show-ref --verify --quiet "refs/tags/nuke-baseline/${DATE}"; then
  PEELED="$(git -C "$PRIMARY_ROOT" rev-parse "nuke-baseline/${DATE}^{}")"
  KIND="$(git -C "$PRIMARY_ROOT" cat-file -t "nuke-baseline/${DATE}")"
  [ "$PEELED" = "$ARCHIVE_SHA" ] && [ "$KIND" = tag ] &&
    git -C "$PRIMARY_ROOT" tag -v "nuke-baseline/${DATE}" ||
    { echo "refusing: nuke-baseline/${DATE} already exists at ${PEELED} (kind ${KIND}) and is not a verified annotated tag at ${ARCHIVE_SHA} — retire that tag deliberately, or run on another date" >&2; exit 1; }
else
  git -C "$PRIMARY_ROOT" tag -a -s -m "Team instruction surface archived ${DATE}" "nuke-baseline/${DATE}" "$ARCHIVE_SHA"
fi
```

The explicit `-m` is not optional: `git tag -a` with no message opens
`$EDITOR`, which a Claude Code Bash call cannot answer.

### Step 4 — push the baseline tag, before anything is deleted

```sh
: "${PRIMARY_ROOT:?}"
DATE="<the literal value step 0 printed>"
git -C "$PRIMARY_ROOT" push origin "nuke-baseline/${DATE}"
```

A rejected push (no write access, offline) **warns loudly and continues**. The
local annotated tag already holds every archived byte, `main` is untouched, and
the tag does not expire the way a reflog entry does. Record the exposure — the
archive is machine-local only — in the final report.

### Step 5 — create the experiment worktree

```sh
: "${PRIMARY_ROOT:?}"
: "${WORKTREE:?}"
: "${ARCHIVE_SHA:?}"
DATE="<the literal value step 0 printed>"
git -C "$PRIMARY_ROOT" worktree add "$WORKTREE" -b "experiment/nuke-${DATE}" "$ARCHIVE_SHA"
```

The branch stays local. It is never pushed and never opens a PR: it holds only
deletions plus `NUKE.md`, and the tag already preserves every removed byte.

### Step 6 — remove the surface in the worktree, then commit

**Every command in this step carries `git -C "$WORKTREE"`.** The same commands
run at `$PRIMARY_ROOT` would stage the deletions on the default branch in the
maintainer's own checkout.

**Remove per path, never in one pathspec list.** A single
`git rm -- a b c d e f` is fatal on the *first* unmatched pathspec and removes
nothing, so it contradicts step 2, whose stop is an OR: step 2 lets a run
proceed when even one deletion-set path survives. Guard each path on its own
presence at the archive, and record the absent ones — the manifest carries them
as `absent`, which is what makes them reportable rather than silent:

```sh
: "${WORKTREE:?}"
: "${ARCHIVE_SHA:?}"
for p in AGENTS.md CLAUDE.md skills agents hooks .claude/hooks; do
  if git -C "$WORKTREE" cat-file -e "${ARCHIVE_SHA}:${p}" 2>/dev/null; then
    git -C "$WORKTREE" rm -r -q -- "$p"
  else
    printf 'absent at %s, will be recorded absent in the manifest: %s\n' "$ARCHIVE_SHA" "$p"
  fi
done
git -C "$WORKTREE" ls-tree -z --name-only "$ARCHIVE_SHA" -- .claude/skills/ |
  tr '\0' '\n' |
  while IFS= read -r entry; do
    case "$entry" in
      ''|.claude/skills/nuke-team-plugin|.claude/skills/nuke-team-plugin/*) continue ;;
    esac
    git -C "$WORKTREE" rm -r -q -- "$entry"
  done
```

The `.claude/skills/` sweep needs no presence guard: every entry it removes came
from `ls-tree` at the same SHA, so each one exists by construction.

Then strip the `hooks` key from the two manifests, leaving every other key —
`.claude-plugin/plugin.json` also carries `name` and `version`, without which
the repointed cache entry cannot load, and `.claude/settings.json` carries
`enabledPlugins` for two unrelated plugins:

**Refuse first, and guard each manifest on its presence at the archive**, the
same way the removal loop does: a manifest absent at `$ARCHIVE_SHA` is recorded
`absent`, never edited or staged, and a `node` that cannot parse or write refuses
the whole run rather than leaving a manifest half-edited for the commit to stage:

```sh
: "${WORKTREE:?}"
: "${ARCHIVE_SHA:?}"
for f in .claude-plugin/plugin.json .claude/settings.json; do
  if git -C "$WORKTREE" cat-file -e "${ARCHIVE_SHA}:${f}" 2>/dev/null; then
    node -e 'const fs=require("fs");const p=process.argv[process.argv.length-1];const j=JSON.parse(fs.readFileSync(p,"utf8"));delete j.hooks;fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n");' "${WORKTREE}/${f}" ||
      { echo "refusing: could not strip the hooks key from ${f} — its JSON did not parse or the write failed" >&2; exit 1; }
  else
    printf 'absent at %s, will be recorded absent in the manifest: %s\n' "$ARCHIVE_SHA" "$f"
  fi
done
```

**Generate the manifest, never type it.** Enumerate the deletion-set roots at
`$ARCHIVE_SHA` and write one line per item found, so an item added after this
skill shipped still gets a line and stays restorable.

A line is `<id> <kind> <path> <baseline> <state> [<path> <baseline> <state> …]`
— **one whole triple per path**, and an item may carry more than one. A `pair`
carries two, and `runtime-hooks` and `dev-hooks` each carry a removed tree plus
an edited manifest. So the generator emits triples, then joins them; it never
emits one fixed-width line.

`<state>` is `-` for every path the nuke *removed*, and only the two edited
manifests are hashed. Hashing is not conditional decoration: a removed path is
gone from the worktree, so `git hash-object` against it errors.

These helpers read named variables rather than positional parameters, because
Hard Rule 9 bans a `$` followed by a digit anywhere in this file.

```sh
export LC_ALL=C
: "${WORKTREE:?}"
: "${ARCHIVE_SHA:?}"
MANIFEST=""

check_path() {   # reads P — syntax, own-directory exclusion, then containment
  case "$P" in
    ''|/*|*..*|*[!A-Za-z0-9._/-]*)
      echo "refusing: path '$P' fails the syntax check" >&2; exit 1 ;;
  esac
  case "$P" in
    .claude/skills/nuke-team-plugin|.claude/skills/nuke-team-plugin/*)
      echo "refusing: path '$P' is inside this skill's own directory" >&2; exit 1 ;;
  esac
  case "$P" in
    AGENTS.md|CLAUDE.md|skills/*|agents/*|hooks/*|.claude/hooks/*|.claude/skills/*|.claude-plugin/plugin.json|.claude/settings.json) ;;
    *) echo "refusing: path '$P' sits outside the deletion-set roots of Hard Rule 10" >&2; exit 1 ;;
  esac
}

add_triple() {   # reads P and K (removed|edited); appends one triple to FIELDS
  check_path
  if git -C "$WORKTREE" cat-file -e "${ARCHIVE_SHA}:${P%/}" 2>/dev/null
  then BASE=present; else BASE=absent; fi
  STATE=-
  if [ "$K" = edited ] && [ "$BASE" = present ]; then
    STATE="$(git -C "$WORKTREE" hash-object -- "${WORKTREE}/${P}")"
  fi
  FIELDS="${FIELDS}${FIELDS:+ }${P} ${BASE} ${STATE}"
}

emit_item() {   # reads ID, KIND, FIELDS
  case "$ID" in
    ''|/*|*..*|*[!A-Za-z0-9._/-]*)
      echo "refusing: generated item id '$ID' fails the syntax check" >&2; exit 1 ;;
  esac
  printf '%s\n' "$MANIFEST" | cut -d' ' -f1 | grep -qxF -- "$ID" &&
    { echo "refusing: duplicate manifest item id '$ID'" >&2; exit 1; }
  MANIFEST="${MANIFEST}${ID} ${KIND} ${FIELDS}
"
}

FIELDS=; ID=guidance; KIND=pair
P=AGENTS.md; K=removed; add_triple
P=CLAUDE.md; K=removed; add_triple
emit_item

ENTRIES="$(for ROOT in skills agents .claude/skills; do
  git -C "$WORKTREE" ls-tree -z --name-only "$ARCHIVE_SHA" -- "${ROOT}/" | tr '\0' '\n'
done)"
# Iterate with `while IFS= read -r`, never a bare for-in over an unquoted
# expansion: the Bash tool's shell is zsh, which does NOT word-split an
# unquoted expansion, so that form would run once over the whole blob. The
# here-doc feeds the loop in
# the current shell (never a pipe), so MANIFEST keeps accumulating and a refusal
# `exit 1` aborts the whole run. The two other enumeration loops use the same
# idiom.
while IFS= read -r ENTRY; do
  case "$ENTRY" in ''|.claude/skills/nuke-team-plugin) continue ;; esac
  # Round-trip proof: every entry came from ls-tree at this SHA, so one that
  # no longer resolves means the NUL-to-newline split cut a path in half.
  TYPE="$(git -C "$WORKTREE" cat-file -t "${ARCHIVE_SHA}:${ENTRY}" 2>/dev/null)" ||
    { echo "refusing: listed entry '$ENTRY' does not resolve at ${ARCHIVE_SHA}" >&2; exit 1; }
  FIELDS=
  case "$TYPE" in
    tree) ID="$ENTRY"; KIND=tree; P="${ENTRY}/" ;;
    blob) ID="${ENTRY%.md}"; KIND=file; P="$ENTRY" ;;
    *) echo "refusing: unexpected object type '$TYPE' for '$ENTRY'" >&2; exit 1 ;;
  esac
  K=removed; add_triple
  emit_item
done <<ENUMERATED
$ENTRIES
ENUMERATED

FIELDS=; ID=runtime-hooks; KIND=group
P=hooks/; K=removed; add_triple
P=.claude-plugin/plugin.json; K=edited; add_triple
emit_item
FIELDS=; ID=dev-hooks; KIND=group
P=.claude/hooks/; K=removed; add_triple
P=.claude/settings.json; K=edited; add_triple
emit_item

printf '%s' "$MANIFEST"
```

The two `group` items run **after** the `node` edit above, so their recorded
hash is the byte-for-byte state the nuke left, which is exactly what R6 later
compares against.

#### Locate the cache entry — read-only, and before the commit

`NUKE.md` carries the cache undo as a **literal** `ln -sfn <primary root>
<cache entry>` line, and a reader's shell has none of this skill's variables
set. That entry path is therefore needed *while `NUKE.md` is being written*,
which is here — not in step 7. This scan is read-only: it moves nothing, so
running it before the commit costs nothing and keeps the run at one commit.

Run the discovery block from `### Step 7 — repoint the plugin cache` now,
unchanged, and keep the entries whose `readlink` target equals `$PRIMARY_ROOT`
byte for byte. Then:

- **Exactly one match** — write its literal path into `NUKE.md`'s
  `### The cache undo` section.
- **Zero or two-or-more matches** — step 7 will refuse the repoint, so there is
  no link to undo. Write the matching zero- or multi-match remediation from
  step 7 into that section instead of an undo line, and say the experiment is
  inert. Never invent an entry path to fill the template.

Write `NUKE.md` at the worktree root from `## NUKE.md template`, then stage and
commit — signed, with no unsigned fallback:

Stage `NUKE.md` always, and each edited manifest only when it was present at the
archive — the mirror of the presence guard on the `node` edit above, so a run
that nuked a partial surface never fails on a `git add` of a manifest that never
existed:

```sh
: "${WORKTREE:?}"
: "${ARCHIVE_SHA:?}"
DATE="<the literal value step 0 printed>"
git -C "$WORKTREE" add -- NUKE.md
for f in .claude-plugin/plugin.json .claude/settings.json; do
  git -C "$WORKTREE" cat-file -e "${ARCHIVE_SHA}:${f}" 2>/dev/null &&
    git -C "$WORKTREE" add -- "$f"
done
git -C "$WORKTREE" commit -S -m "experiment: nuke Team's instruction surface (${DATE})"
```

If signing fails, stop here, print the command and its verbatim error, and
print the recovery line from `## NUKE.md template`. Never commit unsigned.

### Step 7 — repoint the plugin cache

The deletions are inert until this step: Team's skills, agents and hooks are
live in a session because the plugin is *installed*, not because files sit in a
checkout. The dev install is a symlink under `~/.claude/plugins/cache/team-dev/team/`
pointing at the primary clone; repointing it at the experiment worktree is what
makes the nuke real.

**Find the entry by proof, never by arithmetic.** The live entry was named by
whichever checkout last ran the installer, so a directory name computed today
can name a path that does not exist while the real link sits beside it. Match
on the link target instead:

This is the same read-only discovery step 6 already ran to write the undo line
into `NUKE.md`. It is re-run here rather than remembered, because shell state
does not survive a Bash invocation (Hard Rule 3).

```sh
: "${PRIMARY_ROOT:?}"
CACHE_DIR="${HOME}/.claude/plugins/cache/team-dev/team"
# Enumerate with find, never a glob: `-d` says the directory exists, not that
# it has entries, and zsh aborts the whole command on a glob that matches none.
[ -d "$CACHE_DIR" ] ||
  { echo "no cache entry at all: ${CACHE_DIR} does not exist — Team was never dev-installed on this machine" >&2; exit 1; }
find "$CACHE_DIR" -mindepth 1 -maxdepth 1 -print |
  while IFS= read -r entry; do
    if [ -L "$entry" ]; then kind=symlink
    elif [ -d "$entry" ]; then kind=directory
    else kind=file; fi
    printf '%s\t%s\t%s\n' "$entry" "$kind" "$(readlink "$entry" || true)"
  done
```

Keep the entries that are symlinks whose `readlink` target equals
`$PRIMARY_ROOT` byte for byte. Then branch on how many there are.

**Exactly one match.** Prove it is the entry `NUKE.md` names, then ask for an
explicit confirmation — this changes what every Claude Code session on the
machine loads. Name the entry, its current target, and the worktree it will
point at. Only after the user agrees:

`$CACHE_ENTRY` is the single discovered match, bound from the scan above — a
trusted filesystem path. `$RECORDED_ENTRY` comes out of the committed `NUKE.md`,
so it is **read from the file, never retyped** (Hard Rule 12), and shape-checked
before the equality gate:

```sh
: "${PRIMARY_ROOT:?}"
: "${WORKTREE:?}"
: "${CACHE_ENTRY:?}"
CACHE_DIR="${HOME}/.claude/plugins/cache/team-dev/team"
# The undo line is `ln -sfn <primary root> <cache entry>`; the recorded entry is
# its last whitespace-separated field. Reading it with sed keeps any `$(...)`
# planted in NUKE.md inert — command substitution never re-evaluates captured
# bytes.
RECORDED_ENTRY="$(grep -E '^ln -sfn ' "${WORKTREE}/NUKE.md" | head -1 | sed -E 's/^ln -sfn .* //')"
case "$RECORDED_ENTRY" in
  *..*|*[!A-Za-z0-9._/-]*|'')
    echo "refusing the repoint: NUKE.md's undo entry '${RECORDED_ENTRY}' fails the syntax check" >&2; exit 1 ;;
esac
case "$RECORDED_ENTRY" in
  "${CACHE_DIR}/"*) : ;;
  *) echo "refusing the repoint: NUKE.md's undo entry '${RECORDED_ENTRY}' is not under ${CACHE_DIR} — correct NUKE.md by hand, then re-run" >&2; exit 1 ;;
esac
[ "$CACHE_ENTRY" = "$RECORDED_ENTRY" ] ||
  { echo "refusing the repoint: the live entry is ${CACHE_ENTRY}, but NUKE.md's undo line names ${RECORDED_ENTRY} — the cache changed since the commit; correct NUKE.md by hand, then re-run" >&2; exit 1; }
ln -sfn "$WORKTREE" "$CACHE_ENTRY"
readlink "$CACHE_ENTRY"
```

`$RECORDED_ENTRY` is the second path on the undo line step 6 wrote. A mismatch
means the machine's cache moved between the commit and now, so the undo line in
the committed `NUKE.md` would not undo the link this step is about to move —
which is exactly the state that must refuse rather than repoint.

`ln -sfn` replaces the link in place. Never append a trailing slash to a
symlink path in a removal command: BSD `rm -rf link/` follows the link and
empties the checkout behind it.

**Two or more matches.** Refuse the repoint, keep the commit, and list every
entry with its `readlink` target so the maintainer can retire the duplicates by
hand.

**Zero matches.** Refuse the repoint, keep the commit, and give the remediation
for the case actually found — a blanket "run the installer" is a no-op in two
of the four, because the dev installer short-circuits on a link that already
points at its own checkout and skips any path that is already a symlink:

- *No entry at all under the cache directory* — Team was never dev-installed
  here. Run `script/dev-install claude` from `$PRIMARY_ROOT`.
- *A symlink pointing at a `team-nuke-<date>` worktree of this same clone* — an
  earlier experiment is still live. This is this skill's own doing, not a stale
  foreign link. Name the date it carries and give both ways forward: finish
  that experiment through its `NUKE.md` teardown, or undo its cache link
  (relink the entry at `$PRIMARY_ROOT`) and re-run.
- *A symlink pointing anywhere else* (another clone, or a linked worktree that
  ran the installer) — the installer skips an existing symlink, so it does
  nothing here. Print the entry path and its `readlink` target, and say to
  `rm <entry>` first, then run `script/dev-install claude` from
  `$PRIMARY_ROOT`.
- *A real directory* — a plain, non-dev install. Run `script/dev-install claude`
  from `$PRIMARY_ROOT`, which does relink that shape.

Print the remediation; never run it. Removing another checkout's install is a
machine-wide change, and this skill asks before every one of those.

**A declined or failed repoint is not a failure of the run.** The commit
stands. Print the exact command that would complete it and say the experiment
is inert until it runs. Never roll a commit back to fix a machine-local step.

## Final report

Report all of this, every run:

- **The repoint is machine-wide.** While the link points at the worktree, every
  Claude Code session on this machine, in every repo, loads a Team with no
  skills, no agents and no hooks. Live sessions keep whatever they loaded at
  start; the change lands on their next restart.
- **The one-line undo**, ready to paste:
  `ln -sfn <primary root> <cache entry>`. It is idempotent and loses nothing.
- **Known contamination.** The experiment is not a clean room. These survive
  and are reported, never deleted: `~/.claude/CLAUDE.md`, `~/.claude/skills/`,
  and any `CLAUDE.md` in an ancestor directory of the worktree path. The run
  measures "Team removed", not "no instructions".
- **The primary checkout is partially nuked from a session's point of view.**
  It keeps its own `AGENTS.md` and `.claude/`, but loses every runtime skill
  while the link is moved. Work in the worktree.
- **The worktree's test suite is red by construction** — `tests/` survives
  while its targets do not. **Do not repair them.** Repairing them is
  contamination of the experiment.
- Anything the run warned about: a dirty or ahead primary checkout, a rejected
  tag push, a declined or failed repoint.

### Which recovery lines to print

Print, least destructive first, only the lines that apply: the cache undo when
the repoint already happened (it loses nothing), then the whole-tree rollback,
then the ending sequence from `NUKE.md`. Every one of them is printed with the
label saying what it discards.

The ending sequence is conditional. Before printing it, ask whether anything
has been authored in the worktree yet — using only values `NUKE.md` can hold.
The check cannot compare against the nuke commit's own SHA, because `NUKE.md`
is inside that commit and cannot name it; its parent, `ARCHIVE_SHA`, is
recorded, and one commit past the archive is exactly the untouched state:

```sh
: "${WORKTREE:?}"
: "${ARCHIVE_SHA:?}"
git -C "$WORKTREE" rev-list --count "${ARCHIVE_SHA}..HEAD"
git -C "$WORKTREE" status --porcelain
```

A count of exactly 1 **and** an empty status means nothing has been authored:
print the sequence as it stands. Otherwise lead with the preservation lines
(steps 1 to 3) and name what steps 5 and 6 would discard without them. When
signing is unavailable the sequence stops at step 1, before anything is
removed, so an unsignable machine costs the maintainer the ending, never the
experiment.

## Restore mode

`/nuke-team-plugin restore [<item>]` runs **from inside the experiment
worktree**. Bare, it prints the manifest and stops. With an item id it proves
every claim below before it writes anything; a failed proof refuses, names what
failed, and writes nothing. The steps run in order, and none is skipped when an
earlier one already looks convincing.

**R2 through R7 are one Bash invocation.** Run them as a single script, in
order, in one shell — `$TOPLEVEL` (proved in R2) and `$ARCHIVE` (proved in R5)
must be the exact values R6's gate and R7's checkout write against, and shell
state does not survive a Bash boundary (Hard Rule 3). Splitting the blocks
across separate Bash calls loses both bindings, so the value proved is no longer
the value used. The re-restore escape is a separate, deliberate invocation that
re-establishes both proofs from scratch before it writes.

**Every value read from `NUKE.md` is bound by a file-reading command
substitution, and the `<item>` argument by a quoted here-doc — never retyped**
(Hard Rule 12). Retyping a NUKE.md value or the argument into `VAR="<value>"`
would execute any embedded `$(...)` at assignment, before a single gate runs.
The manifest triples are split out of `$MANIFEST_LINES` with parameter
expansion, never read off the line by eye.

**The write scope, stated once.** Restore checks out **every path on the item's
line whose baseline is `present`** — including the whole-file checkout of a
path whose recorded state is a hash, which is what makes `runtime-hooks` and
`dev-hooks` restorable at all, since their manifests were edited rather than
removed. A path whose baseline is `absent` is skipped, and each skip is named
in the output. An item refuses only when *every* path on its line is `absent`.

Checking out an edited manifest whole is equivalent to returning its `hooks`
key, because the recorded hash proves the file is byte-for-byte what the nuke
wrote, so the checkout changes that key and nothing else.

### R1 — the argument

Any first word other than `restore` prints the usage line and stops; the skill
never guesses a mode. With no item id, print the manifest and stop. An item id
is checked before it reaches anything.

The block below runs **only on the with-an-item path**, after the bare-restore
branch above has already been taken and returned. An empty `$ITEM` reaching it
therefore means the mode dispatch was skipped, which is a refusal and not a
second spelling of bare restore — hence the `''` case.

`<item>` is untrusted and has no file to read it from, so it is bound with a
**single-quoted here-doc** (`<<'RESTORE_ITEM'`), whose body is never expanded:
a `$(...)` in the argument lands in `$ITEM` as inert text instead of running at
assignment (Hard Rule 12). The shape check then runs before `$ITEM` reaches any
command. Paste the raw argument on the line between the markers, nothing else:

```sh
export LC_ALL=C
IFS= read -r ITEM <<'RESTORE_ITEM'
<the item argument, pasted here verbatim — no surrounding quotes, no edits>
RESTORE_ITEM
case "$ITEM" in
  ''|/*|*..*|*[!A-Za-z0-9._/-]*)
    echo "refusing: '$ITEM' is not a valid item id — printing the manifest, nothing was written" >&2; exit 1 ;;
esac
```

### R2 — location, branch, and containment

`NUKE.md` must sit at the toplevel of the tree being restored into, and the
current branch must equal the branch recorded in it. Neither is a proof — the
file under test supplies the value it is compared against — so both are cheap
consistency checks that catch the honest mistake with a clear message. The
branch value is still shape-checked before it is compared, because everything
in `NUKE.md` is data (see `## Untrusted input`).

**`$TOPLEVEL` is the binding this whole mode runs against.** R6, R7 and the
re-restore escape all carry `git -C "$TOPLEVEL"` and resolve their paths
against `"$TOPLEVEL/"`, so the value proved here is the value every later write
uses — never the caller's working directory.

The containment proof is the one that matters, and it is **positive, not just
"is not the primary clone"**: refusing the primary root alone leaves every
other checkout on the machine acceptable. Prove instead that this toplevel
carries the `team-nuke-<date>` shape *and* is a registered worktree of the
derived primary root. A path recorded with a hash is restorable in a tree that
was never nuked, so "every recorded state is `-`" is not by itself a proof of
where this is running.

```sh
export LC_ALL=C
TOPLEVEL="$(git rev-parse --show-toplevel)"
[ -f "${TOPLEVEL}/NUKE.md" ] ||
  { echo "refusing: no NUKE.md at ${TOPLEVEL} — run this from inside the experiment worktree" >&2; exit 1; }
COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
PRIMARY_ROOT="$(dirname "$COMMON_DIR")"
[ "$TOPLEVEL" != "$PRIMARY_ROOT" ] ||
  { echo "refusing: ${TOPLEVEL} is the primary clone, not an experiment worktree — restore never writes there" >&2; exit 1; }
case "$TOPLEVEL" in
  */team-nuke-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
  *) echo "refusing: ${TOPLEVEL} does not carry the team-nuke-<date> shape — restore only ever writes into an experiment worktree" >&2; exit 1 ;;
esac
git -C "$PRIMARY_ROOT" worktree list --porcelain | grep -qxF "worktree ${TOPLEVEL}" ||
  { echo "refusing: ${TOPLEVEL} is not a registered worktree of ${PRIMARY_ROOT}" >&2; exit 1; }
RECORDED_BRANCH="$(sed -n 's/^- Branch: //p' "${TOPLEVEL}/NUKE.md" | head -1)"
case "$RECORDED_BRANCH" in
  experiment/nuke-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
  *) echo "refusing: NUKE.md records branch '$RECORDED_BRANCH', which is not a dated experiment/nuke name" >&2; exit 1 ;;
esac
BRANCH="$(git -C "$TOPLEVEL" rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "$RECORDED_BRANCH" ] ||
  { echo "refusing: on ${BRANCH}, but NUKE.md records ${RECORDED_BRANCH} — run 'git switch ${RECORDED_BRANCH}' and re-run" >&2; exit 1; }
```

`$RECORDED_BRANCH` is read from the `- Branch:` header line of `NUKE.md` by a
command substitution over `sed`, never retyped (Hard Rule 12), and shape-checked
before the comparison. `git rev-parse --show-toplevel` and `--git-common-dir`
stay bare — they establish *where this is running* from the caller's directory —
but every read after `$TOPLEVEL` is proved carries `git -C "$TOPLEVEL"`.

### R3 — the manifest block, membership, and the item's line

`NUKE.md` must carry exactly one fenced block whose info string is
`nuke-manifest`. Zero or several is a refusal; the skill never picks one.
Membership is an exact match on field 1, read with the digit-free
`cut -d' ' -f1` and proved with `grep -qxF` — never a substring or a pattern
match, either of which would let `skills/pr` open `skills/pr-cleanup`:

**The opener is one anchored regex** in both the counter and the range start:
an end-anchored `grep -c` paired with an unanchored `sed` counts one block but
extracts from a `nuke-manifestX` decoy fence that the count never saw. The
anchored form `^```nuke-manifest[[:space:]]*$` appears in both, character for
character. **The closer matches a CommonMark closing fence** — up to three
leading spaces, then three *or more* backticks — so a `````` line inside the
block closes the range instead of being swallowed. An unclosed or mis-nested
fence that still runs the range on is caught by the grammar assertion below:
every extracted line must be a whole `<id> <kind> <path> <baseline> <state>`
record, and the extracted count must equal the count that matches the grammar.

**The variable is `MANIFEST_LINES`, never `LINES`.** `LINES` is a zsh special
integer parameter (the terminal's line count); the Bash tool runs zsh, and
assigning a manifest string to `LINES` makes zsh arithmetic-evaluate it on the
next use — `bad math expression` — aborting the run after nothing has been
written. The name is load-bearing.

```sh
export LC_ALL=C
: "${TOPLEVEL:?}"
NUKE_MD="${TOPLEVEL}/NUKE.md"
OPENERS="$(grep -c '^[`]\{3\}nuke-manifest[[:space:]]*$' "$NUKE_MD")"
[ "$OPENERS" = 1 ] ||
  { echo "refusing: NUKE.md carries ${OPENERS} nuke-manifest blocks, not exactly one" >&2; exit 1; }
MANIFEST_LINES="$(sed -n '/^[`]\{3\}nuke-manifest[[:space:]]*$/,/^ \{0,3\}[`]\{3,\}[[:space:]]*$/p' "$NUKE_MD" | sed '1d;$d')"
MANIFEST_GRAMMAR='^[A-Za-z0-9._/-]+ (pair|tree|file|group)( [A-Za-z0-9._/-]+ (present|absent) (-|[0-9a-f]{40}))+$'
TOTAL="$(printf '%s\n' "$MANIFEST_LINES" | grep -c .)"
GOOD="$(printf '%s\n' "$MANIFEST_LINES" | grep -Ec "$MANIFEST_GRAMMAR")"
[ "$TOTAL" = "$GOOD" ] ||
  { echo "refusing: the nuke-manifest block has ${TOTAL} lines but ${GOOD} match the <id> <kind> <path> <baseline> <state> grammar — the fence is malformed or the block was edited" >&2; exit 1; }
printf '%s\n' "$MANIFEST_LINES" | cut -d' ' -f1 | grep -qxF -- "$ITEM" ||
  { echo "refusing: '$ITEM' is not an item in the manifest" >&2; exit 1; }
[ "$(printf '%s\n' "$MANIFEST_LINES" | cut -d' ' -f1 | grep -cxF -- "$ITEM")" = 1 ] ||
  { echo "refusing: duplicate manifest id '$ITEM'" >&2; exit 1; }
```

Then extract **the item's own line** by an exact match on field 1 — pipe-free,
so it never depends on `$ITEM` being regex-safe — for R4 through R7 to read:

```sh
MANIFEST_LINE=""
while IFS= read -r ml; do
  [ -n "$ml" ] || continue
  id="${ml%% *}"
  [ "$id" = "$ITEM" ] && MANIFEST_LINE="$ml"
done <<MANIFEST_RECORDS
$MANIFEST_LINES
MANIFEST_RECORDS
[ -n "$MANIFEST_LINE" ] ||
  { echo "refusing: could not extract the manifest line for '$ITEM'" >&2; exit 1; }
```

### R4 — validate every triple on the line

**One runnable gate, run over every `<path> <baseline> <state>` triple on the
line — not a prose description.** `$ITEM_PATH` comes out of an untrusted file
and goes on to reach `hash-object`, `ls-files`, `checkout` and `git rm -r -f`;
nothing else stands between it and them. The block folds all six checks the
review named into one loop: field count / triple divisibility, the `<kind>`
enum, the `<baseline>` enum, the `<state>` format, the `absent`-with-a-hash
contradiction, and the path's syntax / own-directory exclusion / deletion-set
containment. It also builds the normalized `$TRIPLES` that R6 and R7 re-read, so
the fields are split **once**, with parameter expansion, and never re-read off
the line by eye:

```sh
export LC_ALL=C
: "${MANIFEST_LINE:?}"
KIND="${MANIFEST_LINE#* }"; KIND="${KIND%% *}"
case "$KIND" in
  pair|tree|file|group) ;;
  *) echo "refusing: item kind '$KIND' is not pair|tree|file|group" >&2; exit 1 ;;
esac
REST="${MANIFEST_LINE#* }"; REST="${REST#* }"   # drop <id> and <kind>
TRIPLES=""
n=0; ITEM_PATH=""; BASELINE=""; STATE=""
while [ -n "$REST" ]; do
  tok="${REST%% *}"
  case "$REST" in *' '*) REST="${REST#* }" ;; *) REST="" ;; esac
  [ -n "$tok" ] || continue
  n=$((n + 1))
  case "$n" in
    1) ITEM_PATH="$tok" ;;
    2) BASELINE="$tok" ;;
    3)
      STATE="$tok"; n=0
      case "$ITEM_PATH" in
        ''|/*|*..*|*[!A-Za-z0-9._/-]*)
          echo "refusing: manifest path '$ITEM_PATH' fails the syntax check" >&2; exit 1 ;;
      esac
      ITEM_PATH_LC="$(printf '%s' "$ITEM_PATH" | tr 'A-Z' 'a-z')"
      case "$ITEM_PATH_LC" in
        .claude/skills/nuke-team-plugin|.claude/skills/nuke-team-plugin/*)
          echo "refusing: manifest path '$ITEM_PATH' is inside this skill's own directory, which the nuke never removed" >&2; exit 1 ;;
      esac
      case "$ITEM_PATH" in
        AGENTS.md|CLAUDE.md|skills/*|agents/*|hooks/*|.claude/hooks/*|.claude/skills/*|.claude-plugin/plugin.json|.claude/settings.json) ;;
        *) echo "refusing: manifest path '$ITEM_PATH' sits outside the deletion-set roots of Hard Rule 10" >&2; exit 1 ;;
      esac
      case "$BASELINE" in
        present|absent) ;;
        *) echo "refusing: baseline '$BASELINE' for '$ITEM_PATH' is not present|absent" >&2; exit 1 ;;
      esac
      case "$STATE" in
        -) ;;
        *[!0-9a-f]*) echo "refusing: state for '$ITEM_PATH' is neither '-' nor lowercase hex" >&2; exit 1 ;;
        *) [ "${#STATE}" = 40 ] || { echo "refusing: state for '$ITEM_PATH' is ${#STATE} hex chars, not 40" >&2; exit 1; } ;;
      esac
      { [ "$BASELINE" = absent ] && [ "$STATE" != - ]; } &&
        { echo "refusing: '$ITEM_PATH' is recorded absent but carries a hash state — a contradiction" >&2; exit 1; }
      TRIPLES="${TRIPLES}${ITEM_PATH} ${BASELINE} ${STATE}
"
      ;;
  esac
done
[ "$n" = 0 ] ||
  { echo "refusing: the item line does not divide into whole <path> <baseline> <state> triples" >&2; exit 1; }
[ -n "$TRIPLES" ] ||
  { echo "refusing: the item line carries no paths" >&2; exit 1; }
```

The exclusion case is tested **before** the containment case, on purpose:
`.claude/skills/nuke-team-plugin/SKILL.md` matches `.claude/skills/*`, so
ordering them the other way would admit the one path the nuke must never write.
These are the same checks `check_path` runs in step 6 — both ends of the
manifest are checked, so a hand-edited `NUKE.md` gains nothing a generated one
could not already say.

### R5 — prove the archive ref

The recorded tag name and `ARCHIVE_SHA` come out of the same untrusted file, so
both are **read from `NUKE.md` by `sed`, never retyped** (Hard Rule 12). Only
the tag is signed, so the tag name must match
`^nuke-baseline/[0-9]{4}-[0-9]{2}-[0-9]{2}$`, `git tag -v` must verify it, and
**the trusted commit is the peeled `^{}` value**; the recorded `ARCHIVE_SHA` is
a cross-check that never reaches a command.

**The tag is bound to THIS experiment, not merely to a valid signature.** The
date is derived once from the proved `$TOPLEVEL` worktree name and must key both
the recorded tag and the recorded branch — otherwise an edited `NUKE.md` could
name any other date's verified `nuke-baseline/<other-date>`. Every git read
carries `git -C "$TOPLEVEL"` behind a standalone guard (Hard Rule 1):

```sh
export LC_ALL=C
: "${TOPLEVEL:?}"
RECORDED_TAG="$(sed -n 's/^- Baseline tag: //p' "${TOPLEVEL}/NUKE.md" | head -1)"
RECORDED_ARCHIVE_SHA="$(sed -n 's/^- Archive SHA: //p' "${TOPLEVEL}/NUKE.md" | head -1)"
case "$RECORDED_TAG" in
  nuke-baseline/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) : ;;
  *) echo "refusing: '$RECORDED_TAG' is not a dated nuke-baseline tag name" >&2; exit 1 ;;
esac
NUKE_DATE="${TOPLEVEL##*/team-nuke-}"
case "$NUKE_DATE" in
  [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) : ;;
  *) echo "refusing: cannot read a dated worktree name from ${TOPLEVEL}" >&2; exit 1 ;;
esac
[ "$RECORDED_TAG" = "nuke-baseline/${NUKE_DATE}" ] ||
  { echo "refusing: NUKE.md names tag ${RECORDED_TAG}, not nuke-baseline/${NUKE_DATE} for this worktree — the file was edited" >&2; exit 1; }
[ "$RECORDED_BRANCH" = "experiment/nuke-${NUKE_DATE}" ] ||
  { echo "refusing: NUKE.md names branch ${RECORDED_BRANCH}, not experiment/nuke-${NUKE_DATE} for this worktree — the file was edited" >&2; exit 1; }
case "$RECORDED_ARCHIVE_SHA" in
  *[!0-9a-f]*|'') echo "refusing: NUKE.md's archive SHA is not lowercase hex" >&2; exit 1 ;;
esac
[ "${#RECORDED_ARCHIVE_SHA}" = 40 ] ||
  { echo "refusing: NUKE.md's archive SHA is ${#RECORDED_ARCHIVE_SHA} characters, not 40" >&2; exit 1; }
git -C "$TOPLEVEL" rev-parse --verify --quiet "refs/tags/${RECORDED_TAG}" >/dev/null ||
  { echo "refusing: ${RECORDED_TAG} is missing locally — run 'git fetch origin tag ${RECORDED_TAG}' and re-run" >&2; exit 1; }
git -C "$TOPLEVEL" tag -v "$RECORDED_TAG" ||
  { echo "refusing: ${RECORDED_TAG} does not verify" >&2; exit 1; }
ARCHIVE="$(git -C "$TOPLEVEL" rev-parse "${RECORDED_TAG}^{}")"
[ "$ARCHIVE" = "$RECORDED_ARCHIVE_SHA" ] ||
  { echo "refusing: ${RECORDED_TAG} peels to ${ARCHIVE}, but NUKE.md records ${RECORDED_ARCHIVE_SHA} — the file was edited" >&2; exit 1; }
```

### R6 — the recorded-state gate

`git checkout <sha> -- <path>` overwrites the working tree **and** the index,
so both are checked for every `present` path. A state of `-` requires the path
to be absent from each; the `-L` half is not decoration, because `-e` follows a
link and a dangling symlink would otherwise read as absent. A hash requires the
working file and the staged blob to both equal it, and a path missing from the
index counts as a mismatch:

**Every command here binds to `$TOPLEVEL`.** The `git -C "$TOPLEVEL"` prefix
and the `"${TOPLEVEL}/${ITEM_PATH}"` resolution are what make the guard
load-bearing: with bare `git` and a relative path, this gate would check one
tree while R7 wrote into whichever tree the caller happened to `cd` into. R7's
loop applies this gate to each `present` triple before it checks that path out,
so multi-path items (`pair`, `group`) are gated and restored path by path
rather than as a single unchecked write. The gate reads only present state, so
the maintainer may commit freely in the worktree.

### R7 — check out every present path, then report

**One loop over `$TRIPLES` — R4's normalized `<path> <baseline> <state>` per
line — applies R6's gate and then the checkout to each `present` path.** An
`absent` path is skipped and named; the item refuses only when *every* path was
absent, so nothing silently restores a partial item and nothing silently
restores nothing. Both the gate and the write carry `git -C "$TOPLEVEL"`, so
they land in the tree R2 proved and nowhere else:

```sh
: "${TOPLEVEL:?}"
: "${ARCHIVE:?}"
: "${TRIPLES:?}"
WROTE=0
while IFS=' ' read -r ITEM_PATH BASELINE STATE; do
  [ -n "$ITEM_PATH" ] || continue
  if [ "$BASELINE" = absent ]; then
    printf 'skipping %s — recorded absent at the archive, nothing to restore\n' "$ITEM_PATH"
    continue
  fi
  # R6 recorded-state gate for this present path, working tree AND index.
  if [ "$STATE" = "-" ]; then
    { [ ! -e "${TOPLEVEL}/${ITEM_PATH}" ] && [ ! -L "${TOPLEVEL}/${ITEM_PATH}" ] &&
      [ -z "$(git -C "$TOPLEVEL" ls-files -- "$ITEM_PATH")" ]; } ||
      { echo "refusing: ${ITEM_PATH} is recorded removed but exists in the tree or the index" >&2; exit 1; }
  else
    [ "$(git -C "$TOPLEVEL" hash-object -- "${TOPLEVEL}/${ITEM_PATH}")" = "$STATE" ] &&
    [ "$(git -C "$TOPLEVEL" rev-parse ":${ITEM_PATH}")" = "$STATE" ] ||
      { echo "refusing: ${ITEM_PATH} no longer matches its recorded state ${STATE}" >&2; exit 1; }
  fi
  git -C "$TOPLEVEL" checkout "$ARCHIVE" -- "$ITEM_PATH"
  printf 'restored %s\n' "$ITEM_PATH"
  WROTE=$((WROTE + 1))
done <<ITEM_TRIPLES
$TRIPLES
ITEM_TRIPLES
[ "$WROTE" -ge 1 ] ||
  { echo "refusing: every path on '$ITEM' is recorded absent — nothing to restore" >&2; exit 1; }
```

The `-L` half of the `-` gate is not decoration: `-e` follows a link, so a
dangling symlink would otherwise read as absent. Report every path written,
every `absent` path skipped and why, and that the restored files are live in a
session only after a restart.

### The re-restore escape

Restoring the same item twice is refused by R6 — that is the idempotent
outcome. A filesystem `rm` does **not** clear it, because the index entry
survives and R6 checks the index too. The escape therefore goes through git.

**The escape is its own separate invocation, so it re-proves what it needs
rather than trusting a variable from the main path** (Hard Rule 3): shell state
does not survive a Bash boundary, and a bare `${VAR:?}` guard would only prove a
value is non-empty, not that it was ever proved. Before it writes, the escape
**re-runs R2's containment proof and R5's tag verification from scratch** — the
same blocks, in the same invocation as the writes below — to re-derive
`$TOPLEVEL`, `$ARCHIVE`, and the item's `$TRIPLES`. Only then:

The nuke commit is derived, never read: `NUKE.md` sits inside that commit and
cannot record its own SHA. It records `ARCHIVE_SHA`, and the nuke commit is the
archive's only child on the experiment branch, which R2 has already established
is the current branch:

```sh
: "${TOPLEVEL:?}"
: "${ARCHIVE:?}"
: "${TRIPLES:?}"
NUKE_COMMIT="$(git -C "$TOPLEVEL" rev-list --ancestry-path --reverse "${ARCHIVE}..HEAD" | head -1)"
[ -n "$NUKE_COMMIT" ] ||
  { echo "refusing: cannot derive the nuke commit from ${ARCHIVE}..HEAD" >&2; exit 1; }
[ "$(git -C "$TOPLEVEL" rev-parse "${NUKE_COMMIT}^")" = "$ARCHIVE" ] ||
  { echo "refusing: the derived commit's parent is not the verified archive commit" >&2; exit 1; }
while IFS=' ' read -r ITEM_PATH BASELINE STATE; do
  [ -n "$ITEM_PATH" ] || continue
  [ "$BASELINE" = absent ] && continue
  if [ "$STATE" = "-" ]; then
    git -C "$TOPLEVEL" rm -r -f -- "$ITEM_PATH"
  else
    git -C "$TOPLEVEL" checkout "$NUKE_COMMIT" -- "$ITEM_PATH"
  fi
done <<ITEM_TRIPLES
$TRIPLES
ITEM_TRIPLES
```

Per path on the item's line, both writes are destructive and both bound to
`$TOPLEVEL` like every other restore write: a recorded state `-` is returned
with `git -C "$TOPLEVEL" rm -r -f -- "$ITEM_PATH"`, which clears the working
tree and the index together; a recorded hash is returned with
`git -C "$TOPLEVEL" checkout "$NUKE_COMMIT" -- "$ITEM_PATH"`, restoring the exact
bytes the nuke wrote so the recorded hash matches again.

For a manifest the maintainer edited on purpose, the alternative is a hand
merge from `git show <ARCHIVE_SHA>:<path>`, which writes nothing.

## NUKE.md template

> **`NUKE.md` is a tracked, model-writable file, not a trusted script.** It is
> written into a tree the observed model can also edit. Every destructive line
> below — the teardown sequence, the `reset --hard`, the cache undo — is a
> **paste-ready template a human reads and runs by hand**, never something this
> skill sources or trusts. When the skill itself reads a value back out of
> `NUKE.md` (restore's R2/R3/R5, step 7's undo entry) it re-derives and
> shape-checks it (Hard Rule 12); it never trusts the recorded value on sight.

Step 6 writes `NUKE.md` at the worktree root. **Every value is written
literally** — the run's real SHA, tag name, branch, worktree path and date —
because a reader's shell has none of this skill's variables set.

### Header fields

```md
# NUKE.md — Team instruction-surface experiment

- Archive SHA: 4f9a1c0b7d2e8f36a5b4c3d2e1f0a9b8c7d6e5f4
- Baseline tag: nuke-baseline/2026-08-28
- Branch: experiment/nuke-2026-08-28
- Worktree: /Users/<you>/code/bostonaholic/team-nuke-2026-08-28
- Date: 2026-08-28
```

### The nuke-manifest block

Exactly one fenced block, info string `nuke-manifest`, one generated line per
item, in the format `<id> <kind> <path> <baseline> <state> [...]`. `<kind>` is
one of `pair`, `tree`, `file`, `group` and labels the report only. `<baseline>`
is what the path was at the archive SHA (`present` or `absent`). `<state>` is
what the nuke left there: `-` for a removed path, or the 40-lowercase-hex
`git hash-object` value for an edited manifest.

```nuke-manifest
guidance pair AGENTS.md present - CLAUDE.md present -
skills/pr-cleanup tree skills/pr-cleanup/ present -
agents/implementer file agents/implementer.md present -
.claude/skills/version-bump tree .claude/skills/version-bump/ present -
runtime-hooks group hooks/ present - .claude-plugin/plugin.json present 3b5d0c1a7f4e29806b5a4c3d2e1f0a9b8c7d6e5f
dev-hooks group .claude/hooks/ present - .claude/settings.json present 8a4c2e6019bd7f35c4b3a2918070f6e5d4c3b2a1
```

### The cache undo

Idempotent, and it loses nothing: it points the dev install back at the primary
clone, so the next session loads Team as it was. Written with the run's literal
entry path and primary root, never a variable — which is why step 6 runs the
read-only cache scan **before** it writes this file:

```
ln -sfn /Users/<you>/code/bostonaholic/team /Users/<you>/.claude/plugins/cache/team-dev/team/0.59.0
```

Running it does not end the experiment: the branch, the worktree and the
archive all stay exactly as they were.

When that scan found **zero or several** matching entries, there is no entry
path to write and no link that will be moved. Write step 7's remediation for
the case actually found in place of the line above, under the sentence "no
cache entry was repointed; the experiment is inert until one is." Never write a
guessed path here: a wrong undo line is worse than none, because it is the line
a maintainer pastes without reading.

### Read-only inspection

Never a write. Both lines are safe to run anywhere:

```
git show 4f9a1c0b7d2e8f36a5b4c3d2e1f0a9b8c7d6e5f4:skills/pr-cleanup/SKILL.md
git log --oneline experiment/nuke-2026-08-28
```

`git show <ARCHIVE_SHA>:AGENTS.md` prints the whole router, so a single section
can be copied back by hand. Written with the run's literal SHA:

```
git show 4f9a1c0b7d2e8f36a5b4c3d2e1f0a9b8c7d6e5f4:AGENTS.md
```

### The restore command

The gated skill is the **only** write path into this tree. `NUKE.md` carries no
raw checkout line, so nothing in it can write an arbitrary ref over an
arbitrary path:

```
/nuke-team-plugin restore skills/pr-cleanup
```

Bare `/nuke-team-plugin restore` prints the manifest. Every id in the
`nuke-manifest` block above is a valid argument. **Run it from inside this
experiment worktree** — restore derives its target tree from
`git rev-parse --show-toplevel` and refuses anywhere that is not this
`team-nuke-<date>` worktree, so a restore invoked from the primary clone or
another checkout writes nothing.

### Recovery

The whole-tree rollback is a `git reset --hard` to the archive SHA, written for
the reader as:

```
git -C /Users/<you>/code/bostonaholic/team-nuke-2026-08-28 reset --hard 4f9a1c0b7d2e8f36a5b4c3d2e1f0a9b8c7d6e5f4
```

It **returns the worktree to the archived tree and discards the nuke commit,
every commit made after it, and every uncommitted change.** Nothing that
existed before the run is at risk — `main` is untouched and the baseline tag is
the archive — but the experiment's own output is.

### Teardown — one ordered sequence, never a bare pair

Run these **in order**, with the run's literal paths and dates as written.
Steps 1 to 3 preserve this experiment's output; steps 5 and 6 remove it.

1. Tag the branch tip, annotated and signed, with an explicit message — a tag
   command with no `-m` opens an editor a Claude Code Bash call cannot answer:

   `git -C <primary root> tag -a -s -m "nuke experiment <date>" nuke-result/<date> experiment/nuke-<date>`

   If git says that name is already used — a second experiment on the same date
   — take the next free suffix and carry it through steps 2 and 3:

   `git -C <primary root> tag -a -s -m "nuke experiment <date>" nuke-result/<date>.2 experiment/nuke-<date>`

   then `.3`, counting up to the first free one. **Never `-f`**: the tag
   standing in the way is the other run's only durable copy, and step 1 exists
   precisely so that nothing overwrites it.

2. Push it. Best-effort, like the baseline tag: a refusal leaves the local tag
   holding every commit on the branch.

   `git -C <primary root> push origin nuke-result/<date>`

3. Prove it. Both lines must print, and print the **same** commit SHA, before
   step 4 is run. Take the SHA at the start of the `ls-remote` line — an
   annotated tag's own object SHA is not the commit's, so the ref is read
   peeled:

   `git -C <primary root> ls-remote --tags origin "refs/tags/nuke-result/<date>^{}" | cut -f1`

   When the push in step 2 was refused, prove the local tag instead with
   `git -C <primary root> rev-parse "nuke-result/<date>^{}"`. Either way, the
   second half is the branch tip:

   `git -C <primary root> rev-parse experiment/nuke-<date>`

   Four steps separate the tag from step 6, and a commit made in between would
   otherwise be reflog-only while the first line still passed.

4. Undo the cache link — the one-line command under `### The cache undo`.

5. `git -C <primary root> worktree remove <worktree>`

6. `git -C <primary root> branch -D experiment/nuke-<date>`

Step 5 carries no `--force`, on purpose: an uncommitted restore or a scratch
file then stops the removal and shows itself instead of vanishing. Adding
`--force` discards exactly that, so add it only after reading what step 5
refused to remove.

Steps 5 and 6 run on their own leave the reflog as the only copy of this
experiment's commits, restores, and notes. A reflog is not a copy: it expires,
it is machine-local, and nothing here treats it as a backup. That is what steps
1 to 3 exist to prevent.

Neither tag is ever removed by this file. `nuke-baseline/<date>` is the archive
of everything the nuke deleted, and `nuke-result/<date>` is this experiment's
own record. Removing either one, locally or on the remote, destroys it — so no
command that would do so appears anywhere here, deliberately. Retiring a tag is
a decision the maintainer makes by hand, long after this run.

## Success Criteria

- `main`, the primary checkout, and `docs/skills.md` are byte-for-byte
  unchanged; `git status` in the primary checkout reads the same before and
  after.
- `nuke-baseline/<date>` exists as a verified, signed, annotated tag at the
  archive SHA, and its push was attempted before the first deletion.
- **Exactly one** signed commit sits on `experiment/nuke-<date>` in
  `team-nuke-<date>`, carrying the deletions, the two edited manifests, and
  `NUKE.md`. Step 6's cache-entry scan is read-only and runs before it, so the
  literal undo line is inside that one commit and nothing is amended after
  step 7.
- `NUKE.md` carries exactly one `nuke-manifest` block, with one line per
  removed or edited item, and every deletion-set path absent at the archive
  appears on it as `absent` rather than being silently omitted.

## Pitfalls

- **Running step 6 at `$PRIMARY_ROOT`.** It stages the deletions on the default
  branch in the maintainer's own checkout. Re-read Hard Rule 1.
- **Comparing an unpeeled tag SHA.** Every correctly created baseline then
  reads as a different baseline, and the fail-closed refusal fires on the one
  path that should succeed.
- **Assuming a remote tag row exists in pairs.** A lightweight remote tag has
  no `^{}` row, which is why step 3 reads both.
- **One `git rm` over the whole deletion set.** It is fatal on the first
  unmatched pathspec and removes nothing, which contradicts step 2's OR: step 2
  lets a partially-nuked archive through, so step 6 must remove per path.
- **Testing `.claude/skills` as a whole in step 2.** This skill lives under it,
  so that path is present at every SHA and the already-nuked stop becomes dead
  code. Test the entries *other than* `nuke-team-plugin`.
- **Writing `NUKE.md` before the cache entry is known.** The undo line is
  literal, so the read-only scan runs in step 6, ahead of the commit — not in
  step 7, which would need a second commit to record it.
- **Treating the tag push as a gate.** It is best-effort; a maintainer with no
  push access must not be stranded.
- **Repairing the nuked worktree's test suite.** It is red by construction —
  `tests/` survives while its targets do not. Repairing it is contamination.

## Completion

State the facts of the run — the archive SHA and the branch it came from, the
baseline tag and whether its push succeeded, the worktree path and the commit
SHA, and the recovery line above — then everything `## Final report` lists.
