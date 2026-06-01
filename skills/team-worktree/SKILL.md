---
name: team-worktree
description: Prepare one or more isolated git worktrees — one per repository the topic touches. Router action — no agent. Trigger on "set up the worktree", "isolate this work", or "/team-worktree".
argument-hint: "[docs/plans/<id>/]"
---

# Team Worktree — Isolate the Implementation

Create a git worktree per involved repository so implementation happens on
isolated branches without affecting any main working tree. In single-repo
mode (the default) this is one worktree in the home repo. In multi-repo
mode (when `docs/plans/<id>/repos.md` is present) it is one worktree per
listed repo, all sharing the same `<id>` branch name.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery block below resolves it.

The directory's basename — `<id>` — is used as both the branch name and
the worktree directory name in every involved repo.

Resolve the artifact directory by running this self-contained block (one bash
call — agent threads reset cwd between calls):

```sh
# Three-tier artifact-directory discovery (archetype A).
# ID_RE + PHASE_FILES canonical from hooks/session-start-recover.mjs.
# PHASE_FILES recency mirrors findActiveTopic() in session-start-recover.mjs.
# NOTE: this block is duplicated across 8 skills by design (see docs/architecture.md); future: shared discover-topic.sh.
ID_RE='^([A-Za-z][A-Za-z0-9_]*-[0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2})-[a-z0-9][a-z0-9-]*$'
PHASE_FILES="task questions research design structure plan"
PRED="plan.md"            # predecessor artifact this skill consumes
# Tier 1 — explicit: $ARGUMENTS names an existing dir → use verbatim.
if [ -n "$ARGUMENTS" ] && [ -d "$ARGUMENTS" ]; then
  echo "$ARGUMENTS"; exit 0
fi
# Tier 2 — discover: newest ID_RE dir under docs/plans/ that holds PRED.
best=""; best_mtime=-1
# Assumes cwd is the repo/worktree root (where docs/plans/ lives).
for dir in docs/plans/*/; do
  name="$(basename "$dir")"
  printf '%s' "$name" | grep -qE "$ID_RE" || continue   # ID_RE filter
  [ -f "$dir$PRED" ] || continue                        # predecessor filter
  m=-1
  for p in $PHASE_FILES; do
    f="$dir$p.md"
    [ -f "$f" ] || continue                             # skip racing/absent
    s="$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null)" || continue
    [ "${s:-0}" -gt "$m" ] && m="$s"                    # max-mtime over PHASE_FILES
  done
  [ "$m" -gt "$best_mtime" ] && { best_mtime="$m"; best="$dir"; }
done
[ -n "$best" ] && { echo "$best"; exit 0; }
# Tier 3 — none found: print nothing → fall to AskUserQuestion (prose below).
```

- **If the block printed a path**, use it as `$ARGUMENTS` for the rest of this
  skill (tier 1 explicit arg, or tier 2 discovery). When the path came from
  tier 2 (no explicit arg), announce the resolved directory to the user before
  proceeding, so an auto-picked topic is never silent.
- **If the block printed nothing** (tier 3 — no directory holds `plan.md`),
  do not hard-error. Fire `AskUserQuestion` with a `Setup` header and labeled
  options:
  - **Run the producer** — run `/team-plan docs/plans/<id>/` to produce the
    missing `plan.md`.
  - **Provide a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).

## Detect mode

1. Use the directory resolved in `## Input`.
2. **Read `$ARGUMENTS/repos.md`** if present:
   - Parse the home repo path and the list of additional repos (each with
     `path:` and `name:` fields). See `skills/qrspi-workflow/SKILL.md`
     for the schema.
   - This puts you in **multi-repo mode**.
3. If `repos.md` is absent, you are in **single-repo mode**: only the
   home repo (the one this command is running in) gets a worktree.

## Refusal

**Refuse to create a nested worktree in any involved repo.** For each
target repo, run `git -C <repo-path> rev-parse --absolute-git-dir` and
check whether the resulting path contains `/worktrees/`. If any repo's
current checkout is already inside a worktree, report that and stop —
nesting worktrees is not supported. The user should resolve the nested
worktree (or invoke `/team` from a non-worktree checkout) before retrying.

In multi-repo mode, this check applies to **every** listed repo, not
just the home repo.

## Execution

> Follow `skills/progress-tracking/SKILL.md`: when this procedure has two or more steps, seed one todo item per step before starting and mark each complete as you go.

### Derive identifiers

- `<id>` = `basename "$ARGUMENTS"`
- Branch name = `<id>` (in every involved repo)
- Worktree path per repo = `<repo-path>/.claude/worktrees/<id>` (per
  Claude Code's native worktree convention; see
  `skills/worktree-isolation/SKILL.md`)

**Branch names must never contain a slash (`/`).** Use `-` as the only
delimiter. A `/` in a branch name creates a nested ref path in
`.git/refs/heads/` that collides with Claude Code's `.claude/worktrees/`
directory convention and breaks worktree cleanup. The `<id>` produced by
the questioner is already slash-free, but if `basename "$ARGUMENTS"` ever
yields a name containing `/` (e.g. a ticket prefix like `TEAM/123`),
replace every `/` with `-` first and use that sanitized name as **both**
the branch name and the worktree directory name so the two stay in sync
for cleanup: `branch="$(printf '%s' "$id" | tr '/' '-')"`. Only the
`docs/plans/<id>/` artifact directory keeps the original `<id>`.

### Confirm with the user

Single-repo:
```
Ready to create worktree:

Worktree: <home-worktree-path>
Branch:   <id>
Plan:     $ARGUMENTS/plan.md

Proceed?
```

Multi-repo:
```
Ready to create N worktrees (one per listed repo):

  <repo-1-name> @ <repo-1-path>/.claude/worktrees/<id>
  <repo-2-name> @ <repo-2-path>/.claude/worktrees/<id>
  ...

Branch in each: <id>
Plan:           $ARGUMENTS/plan.md

Proceed?
```

Use `AskUserQuestion` with a `Worktree` header and **Proceed** /
**Cancel** options.

### Create the worktree(s)

After the user confirms:

Use the slash-sanitized name (`<branch>`, derived above) for both the
worktree directory and the `-b` flag in every repo. In the common case
`<branch>` equals `<id>`.

- **Single-repo:** create the home worktree using Claude Code's native
  worktree support, branched off `origin/HEAD`.
- **Multi-repo:** for each listed repo:
  ```
  git -C <repo-path> fetch origin --quiet
  git -C <repo-path> worktree add .claude/worktrees/<branch> -b <branch> origin/HEAD
  ```
  If a repo lacks an `origin` remote or `origin/HEAD`, fall back to its
  current default branch and warn the user once for that repo.

### Carry the artifact directory into the home worktree

Untracked files do not appear automatically in worktrees, and
`docs/plans/<id>/` is typically untracked until it is committed:

```
cp -r $ARGUMENTS <home-worktree>/docs/plans/<id>/
```

In multi-repo mode, **only the home worktree** gets the artifact
directory. Agents working in additional repos read artifacts from the
home worktree path, which the orchestrator passes in.

### Record the worktree paths (multi-repo only)

After all worktrees are created, append a `## Worktrees` section to the
home worktree's `docs/plans/<id>/repos.md` listing each repo's worktree
path. This becomes the discoverable record any later `/team-*` invocation
reads to relocate the worktrees.

```markdown
## Worktrees
- home: <home-worktree-path>
- <repo-name>: <repo-path>/.claude/worktrees/<id>
- ...
```

## Why isolate

Implementation work touches the working tree. A worktree per repo gives
the implementer a clean checkout per topic in every involved repo, so
concurrent pipelines do not interfere. For trivial single-file changes,
in-place implementation is allowed — no worktree needed.

## Completion

Report the worktree paths and tell the user:

- Single-repo: **"Next: cd <home-worktree> and run `/team-implement docs/plans/<id>/`"**
- Multi-repo: **"Next: cd <home-worktree> and run `/team-implement
  docs/plans/<id>/`. The implementer will navigate between the
  per-repo worktrees as the plan steps require."**
