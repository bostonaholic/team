---
name: worktree-isolation
description: Worktree isolation methodology — loaded by the router to run the entire Team pipeline in one or more isolated git worktrees, enabling parallel /team runs and features that span multiple repositories
user-invocable: false
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

- **Containment check first:** each `<repo-path>`'s `realpath` must
  resolve to a direct child of the home repo's parent directory
  (`dirname "$(realpath "<repo-path>")"` equals
  `dirname "$(realpath "<home-root>")"`). A repo that fails is refused
  and reported — `repos.md` content is not trusted blindly.
- For each repo with absolute path `<repo-path>` in `repos.md` that
  passes the containment check:
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

The home worktree is created at the **leading WORKTREE phase** — phase 1
of 8, before QUESTION (see [Why first](#why-first) below for the
rationale). The router's responsibilities are:

1. Create the home repo's worktree on branch `<id>` off `origin/HEAD`,
   and author `docs/plans/<id>/` **inside** it — no copy is ever needed
   because the artifact directory is born in the worktree. (Secondary
   repos in multi-repo mode get their worktrees after the design review,
   once `repos.md` confirms the repo set; same `<id>` branch in each.)
2. After this phase, all downstream agent dispatches operate within the
   appropriate worktree (the home worktree by default; per-repo worktrees
   when a slice or step carries a `[repo: <name>]` annotation). The
   durable inter-agent protocol is the artifact files under the home
   worktree's `docs/plans/<id>/` directory; live coordination uses
   TodoWrite (session-scoped).

### Reusing an existing worktree

If the session is already running inside a **linked worktree** — any
working tree other than the repository's main working tree, detected by
the checkout's git dir differing from its common git dir — on a
**non-default branch**, the WORKTREE phase reuses it instead of creating
a new one: no new branch, no artifact copy — work continues in place on
the current branch. If that worktree is checked out on the default
branch (main/master), the phase refuses and stops — implementing
directly on the default branch is never acceptable, and nesting
worktrees is not supported. See "Detect existing worktree" in
`skills/team-worktree/SKILL.md` for the procedure.

### Why first

Worktree creation is the leading phase — it runs first, before QUESTION —
for two load-bearing reasons.

First, authoring `docs/plans/<id>/` inside the worktree from phase 1
keeps the home checkout's `git status` clean for the entire run. No
intermediate artifacts, test scaffolding, or commits ever touch the
main working tree.

Second, a leading worktree gives the recovery hooks a genuine first
state to detect: "a worktree exists for `<id>`, no `task.md` yet" ⇒
WORKTREE. The phase becomes inferable from the moment the run begins
rather than only appearing midway through the pipeline.

For artifact ergonomics, the orchestrator **reports the absolute
worktree-rooted `docs/plans/<id>/` path** — where `design.md` and the
`design-review-<n>.md` verdict records live — so anyone auditing the
run opens the artifacts cleanly without hunting for the worktree — this
supersedes the old "review on the home tree" rationale.

Together these make leading placement a deliberate, articulable choice.

### During the pipeline

All agents — researcher, planner, test-architect, implementer, reviewers —
run inside whichever worktree the orchestrator hands them for the current
slice or step. In single-repo mode that is always the home worktree. In
multi-repo mode the implementer changes directory between repos as the
plan steps require, committing each slice in the worktree where its
files live. Main working trees are never touched.

### Ship (teardown)

Opening a PR does **not** tear down the worktree — the user may need to
iterate on the branch (push follow-up commits, address review feedback).
Keep the worktree until the PR is merged or the user explicitly asks to
remove it. The same holds when commits are kept locally without a PR.

When teardown is warranted (post-merge or on explicit request):

1. For each worktree with commits ahead of its base branch, cherry-pick
   or rebase commits onto the target branch in that repo, then let
   Claude Code (or `git worktree remove`) remove the worktree.
2. Empty worktrees clean up automatically.
3. If manual cleanup is needed: `git -C <repo-path> worktree remove
   <worktree-path>` and `git -C <repo-path> branch -D <id>`.
4. After the worktree is gone, update the repo's local default branch
   with the merge: `git -C <repo-path> pull --rebase origin <base>`.
   Always rebase — never a merge commit — so history stays linear.
5. Remove the feature's local planning docs: `rm -rf docs/plans/<id>`.
   These are untracked QRSPI scratch that only existed to drive the work
   to a merged PR; deleting them is part of teardown, alongside the
   branch and worktree. Verify the directory is untracked first
   (`git ls-files docs/plans/<id>` returns nothing) and remove only that
   feature's `<id>` directory — never sibling dirs for other in-flight
   work.

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
