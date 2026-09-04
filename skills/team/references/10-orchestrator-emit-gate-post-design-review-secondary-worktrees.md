### Orchestrator-Emit Gate (post-design-review secondary worktrees)

One rule, two knowledge times: **each repo's worktree is born the moment
that repo is known.** The home repo is known at phase 1, so its worktree is
born at the leading WORKTREE phase. The rest are settled only once the
design lands, in `4-repos.md`, so in multi-repo mode their worktrees are
created **after the design review**.

When the design review passes:

1. **Detect mode.** If `docs/plans/<id>/4-repos.md` exists, you are in
   **multi-repo mode** — create one secondary worktree per more repo listed
   in that file, all on the same `<id>` branch. Otherwise you are in
   **single-repo mode** and nothing further is needed here (the home
   worktree already exists). Call the Skill tool with
   `worktree-isolation` for
   the topology and `team-worktree` for
   the procedure.
   Create the worktrees **without a confirmation prompt** — the phase loop
   never pauses mid-run. The "Confirm with the user" dialog in
   `skills/team-worktree/SKILL.md` applies only to standalone human
   invocation of `/team-worktree`. The resolved repo set is already
   recorded loudly in `6-design.md` (`## Decisions made`/`## Risks`) and
   echoed in the PR body's `## Review notes`. Before each
   `git worktree add`, re-check **containment**: the repo path's `realpath`
   must be a direct child of the home repo's parent directory. Refuse and
   report any repo that fails (`4-repos.md` may have been authored without a
   Bash-side path check).
2. **Append a `## Worktrees` section to `4-repos.md`**, post-design-review,
   **back-recording the home worktree path** created at the leading
   WORKTREE phase, plus each secondary repo's worktree path. Later
   `/team-*` invocations can then rediscover every worktree from that one
   file. The other repos' worktrees do not duplicate the artifacts. Agents
   that need them read from the home worktree path the orchestrator passes
   in.
3. **Edge — a secondary repo's worktree fails to create** (shallow clone,
   CI, permissions): report it and continue. That repo's portion of the
   work runs in its main tree. The pipeline is never blocked (mirror
   `skills/worktree-isolation/SKILL.md` → "Fallback").
