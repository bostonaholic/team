### Orchestrator-Emit Gate (post-design-review secondary worktrees)

When the design review passes:

1. **Detect mode.** If `docs/plans/<id>/4-repos.md` exists, you are in
   **multi-repo mode** — create one secondary worktree per more repo listed
   in that file, all on the same `<id>` branch. Otherwise you are in
   **single-repo mode** and nothing further is needed here. Read the
   [worktree playbook](../team-worktree/playbooks/worktree.md) for
   the topology and call the Skill tool with `team-worktree` for
   the procedure.
   Create the worktrees **without a confirmation prompt**. The "Confirm with the user" dialog in
   `skills/team-worktree/SKILL.md` applies only to standalone human
   invocation of `/team-worktree`. Before each
   `git worktree add`, re-check **containment**: the repo path's `realpath`
   must be a direct child of the home repo's parent directory. Refuse and
   report any repo that fails.
2. **Append a `## Worktrees` section to `4-repos.md`**, post-design-review,
   **back-recording the home worktree path** created at the leading
   WORKTREE phase, plus each secondary repo's worktree path. Secondary
   worktrees do not duplicate the artifacts: agents read them from the home
   worktree path the orchestrator passes in.
3. **Edge — a secondary repo's worktree fails to create**: report it and
   continue. That repo's portion of the work runs in its main tree. The
   pipeline is never blocked.
