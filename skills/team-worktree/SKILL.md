---
name: team-worktree
description: Prepare one or more isolated git worktrees — one per repository the topic touches. Router action — no agent. Trigger on "set up the worktree", "isolate this work", or "/team-worktree".
argument-hint: "docs/plans/<id>/"
---

# Team Worktree — Isolate the Implementation

Create a git worktree per involved repository so implementation happens on
isolated branches without affecting any main working tree. In single-repo
mode (the default) this is one worktree in the home repo. In multi-repo
mode (when `docs/plans/<id>/repos.md` is present) it is one worktree per
listed repo, all sharing the same `<id>` branch name.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`.

The directory's basename — `<id>` — is used as both the branch name and
the worktree directory name in every involved repo. If `$ARGUMENTS/plan.md`
does not exist, tell the user to run `/team-plan docs/plans/<id>/` first
and stop.

## Detect mode

1. **Verify** `$ARGUMENTS/plan.md` exists.
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

### Derive identifiers

- `<id>` = `basename "$ARGUMENTS"`
- Branch name = `<id>` (in every involved repo)
- Worktree path per repo = `<repo-path>/.claude/worktrees/<id>` (per
  Claude Code's native worktree convention; see
  `skills/worktree-isolation/SKILL.md`)

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

- **Single-repo:** create the home worktree using Claude Code's native
  worktree support, branched off `origin/HEAD`.
- **Multi-repo:** for each listed repo:
  ```
  git -C <repo-path> fetch origin --quiet
  git -C <repo-path> worktree add .claude/worktrees/<id> -b <id> origin/HEAD
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
