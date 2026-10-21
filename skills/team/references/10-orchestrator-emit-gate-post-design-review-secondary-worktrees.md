### Orchestrator-Emit Gate (post-design-review secondary worktrees)

When the design review passes:

1. **Detect mode.** If `docs/plans/<id>/4-repos.md` exists (**multi-repo
   mode**), create one secondary worktree per additional repo it lists, all on
   branch `<id>`. Otherwise (**single-repo mode**) do nothing here. Read the
   [worktree playbook](../team-worktree/playbooks/worktree.md) for the topology
   and call the Skill tool with `team-worktree` for the procedure.
   Create them **without a confirmation prompt**: the "Confirm with the user"
   dialog in `skills/team-worktree/SKILL.md` applies only to standalone
   `/team-worktree`. Before each `git worktree add`, re-check **containment**: the repo
   path's `realpath` must be a direct child of the home repo's parent
   directory. Refuse and report any repo that fails.
2. **Append a `## Worktrees` section to `4-repos.md`** recording the home
   worktree path and each secondary worktree path. Secondary worktrees hold no
   artifact copies; agents read artifacts from the home worktree path the
   orchestrator passes.
3. **Edge — a secondary worktree fails to create:** report it and continue; that repo's work runs in its main
   tree. Never block the pipeline (mirror "Fallback" in
   `skills/team-worktree/playbooks/worktree.md`).
