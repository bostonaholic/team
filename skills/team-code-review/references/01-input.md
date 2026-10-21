`$ARGUMENTS` is the artifact directory `docs/plans/<id>/`. If it is empty, the
discovery command below resolves it. Reviewers receive these `$ARGUMENTS/`
files as intent paths:

- `1-task.md`, always.
- `8-plan.md`, when present.

`4-repos.md` is present only when the topic spans more than one repository.
Its presence marks multi-repo mode.

Resolve `<team-skill-dir>` to the absolute directory containing
`skills/team/SKILL.md`. From the repository root, run:

```sh
"<team-skill-dir>/discover-topic.sh" "${ARGUMENTS:-}" "8-plan.md"
```

- **If the command printed a path**, use it as `$ARGUMENTS`. When the path
  came from tier 2 discovery (no explicit arg), announce the resolved
  directory to the user before you continue, so an auto-picked topic is never
  silent.
- **If the command printed nothing** (tier 3), do not hard-error. Fire one
  `AskUserQuestion` with a `Setup` header and two labeled options:
  - **Run the producer** — run `/team-implement docs/plans/<id>/` to build
    the branch that this phase reviews.
  - **Give a path** — the user supplies the `docs/plans/<id>/` directory
    (`ls docs/plans/` lists them).

A directory that holds only `1-task.md` needs an explicit path, as the
argument or as the **Give a path** answer.

Require `$ARGUMENTS/1-task.md`. When it is absent, halt and name its absolute
path.

## Worktrees

Resolve the home worktree to the first hit in this order:

1. The linked worktree that holds `docs/plans/<id>/`, when
   `git -C <plan-dir> rev-parse --absolute-git-dir` contains `/worktrees/`.
2. The session's current linked worktree: `git rev-parse --absolute-git-dir`
   contains `/worktrees/`.
3. The `git worktree list` entry whose basename is `<id>`, per the
   `.claude/worktrees/<id>` convention.
4. The main checkout that holds `docs/plans/<id>/`.

Every reader of a `review-<n>.md` or `security-review-<n>.md` record
resolves the home worktree by this same order.

In multi-repo mode, the companion worktree paths come from the `## Worktrees`
section of `4-repos.md`. If any listed worktree is missing, tell the user to
run `/team-worktree [docs/plans/<id>/]` and stop.

Run every git command as `git -C <worktree-path>`. The main session never
changes directory.

## Entry guards

Run these guards in each worktree in scope, before any dispatch. The
"Branch state" section of the
[artifact schema](../team/references/artifacts.md) defines the default
branch, the base ref, the merge-base, and branch commits.

1. **Default branch.** Resolve the default branch. Compare it with
   `git -C <worktree-path> rev-parse --abbrev-ref HEAD`. On the default
   branch, refuse and stop. The fix loop commits, and the default branch is
   never a fix target. Write no record.
2. **Merge-base.** Resolve the base ref from the default branch that guard 1
   resolved. Then resolve the merge-base. When either step halts, write no
   record.
3. **Commits.** When no worktree in scope has branch commits, stop with
   "Nothing to review". Name `/team-implement docs/plans/<id>/` as the next
   command. Write no record.
4. **Clean tree.** Run
   `git -C <worktree-path> status --porcelain --untracked-files=all -- . ':(exclude)docs/plans/'`.
   When it prints anything, refuse and stop. Name each path, and tell the
   user to commit or remove those changes, then re-run
   `/team-code-review docs/plans/<id>/`. Reviewers judge only commits, and a
   record over a dirty tree is stale on arrival. Write no record.
