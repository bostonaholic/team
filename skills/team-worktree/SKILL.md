---
name: team-worktree
description: Prepare an isolated git worktree for the implementation. Router action — no agent. Trigger on "set up the worktree", "isolate this work", or "/team-worktree".
---

# TEAM Worktree — Standalone Phase

Run the WORKTREE phase. Requires `plan.drafted` in the event log.

## Execution

1. Read `~/.team/<topic>/events.jsonl`. Scan for `plan.drafted`.
2. If not found: report "No plan drafted. Run /team-plan first." and stop.
3. Use Claude Code's native worktree support to create an isolated worktree
   for this topic. See `skills/worktree-isolation/SKILL.md` for the full
   methodology.
4. Append `worktree.prepared` event with
   `{worktreePath, branch, isolation: "worktree" | "in-place"}`.
5. **Stop after `worktree.prepared` is recorded.**

## Why isolate

Implementation work touches the working tree. A worktree gives the implementer
a clean, isolated checkout per topic, so concurrent pipelines do not interfere.
For trivial single-file changes, in-place implementation is allowed — record
`isolation: "in-place"` in the event.

## Completion

Report the worktree path and suggest: "/team-implement to start writing code"
