---
name: worktree-isolation
description: Worktree isolation methodology — loaded by the router to run the entire TEAM pipeline in one or more isolated git worktrees, enabling parallel /team runs and features that span multiple repositories
---

# Worktree Isolation

Every `/team` pipeline run operates in **one or more** isolated git
worktrees — one per repository the topic touches. The worktree boundary
is at the **router level** — not per-agent. This means:

1. **Parallel pipelines.** Multiple `/team` runs can execute simultaneously
   without file conflicts. Each gets its own worktree(s).
2. **Clean main tree(s).** The user's working tree in every involved repo
   is never polluted by in-progress implementation, test scaffolding, or
   intermediate commits.
3. **Simple agents.** No agent needs to know about isolation. They operate
   in whatever directory the orchestrator hands them.
4. **Multi-repo features.** A single topic can span repos (e.g. frontend
   + backend + shared types) by listing them in `docs/plans/<id>/repos.md`.
   The router creates a worktree in each, branched off the same `<id>`.

## Single-repo (default)

When `docs/plans/<id>/repos.md` is **absent**, the topic touches only the
home repo (the repo the user invoked `/team` from). The router creates
exactly one worktree using Claude Code's native worktree support:

- Worktree path: `<repo>/.claude/worktrees/<id>`
- Branch: `<id>`, branched from the default remote branch (`origin/HEAD`)
- Cleans up automatically if no changes remain after exit

No custom worktree creation, path management, or teardown logic is needed.

## Multi-repo

When `docs/plans/<id>/repos.md` is **present**, the topic spans multiple
repos. The router creates **one worktree per listed repo**, all sharing
the same branch name `<id>`:

- For each repo with absolute path `<repo-path>` in `repos.md`:
  - Worktree path: `<repo-path>/.claude/worktrees/<id>`
  - Branch: `<id>`, branched from that repo's `origin/HEAD`
  - Created via `git -C <repo-path> worktree add .claude/worktrees/<id> -b <id> origin/HEAD`
- The **home repo's worktree** holds the canonical `docs/plans/<id>/`
  artifact directory. The other repos' worktrees do not duplicate the
  artifacts; agents that need them read from the home worktree's path,
  which the orchestrator passes in.

After all worktrees are created, the orchestrator appends a `## Worktrees`
section to `repos.md` recording the per-repo worktree paths. Any later
`/team-*` invocation rediscovers them by reading that one file.

## Claude Code Native Worktrees

For the home repo, Claude Code has built-in worktree support (`--worktree
<topic>` or dispatch into a worktree context). For additional repos in
multi-repo mode, the router uses plain `git worktree add` because Claude
Code's native flag only knows about the repo it was launched from. Either
mechanism produces a standard git worktree — there is no behavioral
difference downstream.

## Lifecycle

### Setup (router responsibility)

During the router's Setup phase, before any agent is dispatched:

1. Create the home repo's worktree. If `repos.md` is present, create a
   worktree in each additional repo it lists (same `<id>` branch in each).
2. All subsequent agent dispatches operate within the appropriate
   worktree (the home worktree by default; per-repo worktrees when a
   slice or step carries a `[repo: <name>]` annotation).
3. The durable inter-agent protocol is the artifact files under the
   home worktree's `docs/plans/<id>/` directory. Live coordination uses
   TodoWrite (session-scoped).

### During the pipeline

All agents — researcher, planner, test-architect, implementer, reviewers —
run inside whichever worktree the orchestrator hands them for the current
slice or step. In single-repo mode that is always the home worktree. In
multi-repo mode the implementer changes directory between repos as the
plan steps require, committing each slice in the worktree where its
files live. Main working trees are never touched.

### Ship (teardown)

After shipping:

1. For each worktree with commits ahead of its base branch, cherry-pick
   or rebase commits onto the target branch in that repo, then let
   Claude Code (or `git worktree remove`) remove the worktree.
2. Empty worktrees clean up automatically.
3. If manual cleanup is needed: `git -C <repo-path> worktree remove
   <worktree-path>` and `git -C <repo-path> branch -D <id>`.

## Gitignored Files

Git worktrees are fresh checkouts — they don't include untracked files like
`.env` or `.env.local`. To copy these automatically, add a `.worktreeinclude`
file to the project root using `.gitignore` syntax:

```
.env
.env.local
```

Only files matching a pattern that are also gitignored get copied. In
multi-repo mode, each repo honors its own `.worktreeinclude` independently.

## Fallback

If worktree creation fails in any repo (shallow clones, certain CI systems):

1. Report the failure for that repo: "Worktree creation failed in <name>.
   Falling back to main tree for that repo."
2. Continue the pipeline. Other repos still get worktrees; the failing
   repo's portion of the work runs in its main working tree.
3. If creation fails in the home repo, the orchestrator proceeds with
   in-place work for the entire pipeline — no isolation, but the pipeline
   still runs.

Never block the pipeline because worktree creation failed — isolation is
a best-practice enhancement, not a hard requirement.
