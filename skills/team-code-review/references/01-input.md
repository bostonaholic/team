`$ARGUMENTS` is the artifact directory `docs/plans/<id>/`; if empty, the
discovery command below resolves it. Reviewers receive these `$ARGUMENTS/`
intent paths: `1-task.md` always, `8-plan.md` when present. `4-repos.md`
exists only for multi-repo topics, and its presence marks multi-repo mode.

Resolve `<team-skill-dir>` to the absolute directory containing
`skills/team/SKILL.md`. From the repository root, run:

```sh
"<team-skill-dir>/discover-topic.sh" "${ARGUMENTS:-}" "8-plan.md"
```

- **Printed a path** → use it as `$ARGUMENTS`; announce it when no explicit
  arg was given.
- **Printed nothing** → do not hard-error. Fire one
  `AskUserQuestion` with a `Setup` header and two labeled options:
  - **Run the producer** — run `/team-implement docs/plans/<id>/` to build
    the branch this phase reviews.
  - **Give a path** — the user supplies `docs/plans/<id>/` (`ls docs/plans/` lists them).

A directory holding only `1-task.md` needs an explicit path, as the argument
or the **Give a path** answer.

Require `$ARGUMENTS/1-task.md`; when absent, halt and name its absolute path.

## Worktrees

Resolve the home worktree to the first hit, in this order (every reader of a
`review-<n>.md` or `security-review-<n>.md` record uses the same order):

1. The linked worktree holding `docs/plans/<id>/`, when
   `git -C <plan-dir> rev-parse --absolute-git-dir` contains `/worktrees/`.
2. The session's current linked worktree: `git rev-parse --absolute-git-dir`
   contains `/worktrees/`.
3. The `git worktree list` entry whose basename is `<id>`
   (`.claude/worktrees/<id>` convention).
4. The main checkout holding `docs/plans/<id>/`.

In multi-repo mode, companion worktree paths come from `4-repos.md`'s
`## Worktrees` section. If any is missing, tell the user to run
`/team-worktree [docs/plans/<id>/]` and stop.

Run every git command as `git -C <worktree-path>`; the main session never
changes directory.

## Entry guards

Run these in each worktree in scope, before any dispatch. Each refusal or
stop writes no record. The "Branch state" section of the
[artifact schema](../team/references/artifacts.md) defines the default
branch, base ref, merge-base, and branch commits.

1. **Default branch.** If `git -C <worktree-path> rev-parse --abbrev-ref HEAD`
   is the default branch, refuse and stop; the fix loop never commits there.
2. **Merge-base.** Resolve the base ref from guard 1's default branch, then
   the merge-base. Either halting stops the phase.
3. **Commits.** When no worktree in scope has branch commits, stop with
   "Nothing to review" and name `/team-implement docs/plans/<id>/` as next.
4. **Clean tree.** Run
   `git -C <worktree-path> status --porcelain --untracked-files=all -- . ':(exclude)docs/plans/'`.
   Any output → refuse and stop. Name each path and tell the user to commit
   or remove those changes, then re-run `/team-code-review docs/plans/<id>/`.
