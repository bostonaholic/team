### Orchestrator-Emit Gate (leading worktree)

A `/team` run authors `docs/plans/<id>/` inside an isolated worktree on branch
`<id>` from phase 1, so the home checkout stays clean all run.

0. **Preflight, then continue regardless.** Run
   `<team-skill-dir>/scripts/preflight.sh` once (`<team-skill-dir>` is the
   installed `skills/team/` directory) and report its four lines. **No
   reading or exit code blocks the run.** What each failed reading predicts:
   - **Unreachable `ssh-agent`:** the PR-phase push fails; with global
     `commit.gpgsign` `true`, tests that commit to a scratch repo stall on
     signing and fail far from the diff.
   - **Failing or hanging signing probe:** every later commit stalls, a hard
     stop under the no-unsigned-commits rule.
   - **Missing `gh` login:** only the PR phase fails.

   When a later failure matches a reading, cite the reading as an
   environmental cause instead of diagnosing it as a branch regression.
1. **Create the home worktree** on branch `<id>` off `origin/HEAD`, with the
   host's native worktree support when offered, otherwise `git worktree add`:
   call the Skill tool with `team-worktree` and follow the single-repo block
   under "Create the worktree(s)". Only the home repo gets a worktree here;
   multi-repo secondaries wait for the post-design-review gate.
   **If the run started inside a linked worktree on a non-default branch, reuse it**
   ("Detect existing worktree" in `skills/team-worktree/SKILL.md`); on the
   default branch, stop rather than implement on it.
2. **Create `docs/plans/<id>/` inside the worktree.**
3. **Compute the worktree's absolute path once** and thread the
   worktree-rooted `docs/plans/<id>/` path into every downstream dispatch. The
   main session does NOT `cd` into the worktree.
4. **Edge — branch `<id>` already exists** (re-invocation): reuse the
   worktree already on it; do not recreate.
5. **Edge — home-worktree creation fails.** Report loudly and run
   **in place for the entire run**: author `docs/plans/<id>/` at the home-repo
   root and thread that absolute path downstream; never block on it ("Fallback"
   in `skills/team-worktree/playbooks/worktree.md`).
