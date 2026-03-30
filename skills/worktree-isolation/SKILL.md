---
name: worktree-isolation
description: Worktree isolation methodology — loaded by the router to run the entire TEAM pipeline in an isolated git worktree using Claude Code's native worktree support, enabling parallel /team runs
---

# Worktree Isolation

Every `/team` pipeline run operates in its own isolated git worktree. The
worktree boundary is at the **router level** — not per-agent. This means:

1. **Parallel pipelines.** Multiple `/team` runs can execute simultaneously
   without file conflicts. Each gets its own worktree.
2. **Clean main tree.** The user's working tree is never polluted by
   in-progress implementation, test scaffolding, or intermediate commits.
3. **Simple agents.** No agent needs to know about isolation. They operate
   in whatever directory they're given.

## Claude Code Native Worktrees

Claude Code has built-in worktree support. The router creates the worktree
at setup time using `--worktree <topic>` or by dispatching into a worktree
context. Claude Code handles everything:

- Creates a worktree at `<repo>/.claude/worktrees/<name>`
- Branches from the default remote branch (`origin/HEAD`)
- Provides an isolated copy of the repository
- Cleans up automatically if no changes remain after exit

No custom worktree creation, path management, or teardown logic is needed.

## Lifecycle

### Setup (router responsibility)

During the router's Setup phase, before the first event is appended:

1. Create an isolated worktree for this pipeline run.
2. All subsequent agent dispatches operate within the worktree.
3. The event log lives at `~/.team/events.jsonl` (global, not per-worktree)
   so the Teamflow dashboard can tail events regardless of which worktree
   the pipeline runs in. Plan artifacts stay in the worktree's `docs/plans/`.

### During the pipeline

All agents — researcher, planner, test-architect, implementer, reviewers —
run inside the same worktree. They read and write files, run tests, and make
commits within the worktree's branch. The main working tree is untouched.

### Ship (teardown)

After shipping:

1. Cherry-pick or rebase commits from the worktree branch onto the target branch.
2. Claude Code removes the worktree automatically if no uncommitted changes remain.
3. If manual cleanup is needed: `git worktree remove <path>` and
   `git branch -D <branch>`.

## Gitignored Files

Git worktrees are fresh checkouts — they don't include untracked files like
`.env` or `.env.local`. To copy these automatically, add a `.worktreeinclude`
file to the project root using `.gitignore` syntax:

```
.env
.env.local
```

Only files matching a pattern that are also gitignored get copied.

## Fallback

If worktree creation fails (shallow clones, certain CI systems):

1. Report the failure: "Worktree creation failed. Falling back to main tree."
2. Continue the entire pipeline in the main working tree.
3. Note in the `feature.requested` event that isolation was not used.

Never block the pipeline because worktree creation failed — isolation is
a best-practice enhancement, not a hard requirement.
