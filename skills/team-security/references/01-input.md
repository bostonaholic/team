`$ARGUMENTS` is the artifact directory `docs/plans/<id>/`. If it is empty, the
discovery command below resolves it. The reviewer receives these
`$ARGUMENTS/` files as intent paths:

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
  - **Run the producer** — run `/team-review docs/plans/<id>/` to pass the
    review that this phase follows.
  - **Give a path** — the user supplies the `docs/plans/<id>/` directory
    (`ls docs/plans/` lists them).

A directory that holds only `1-task.md` needs an explicit path, as the
argument or as the **Give a path** answer.

Require `$ARGUMENTS/1-task.md`. When it is absent, halt and name its absolute
path.

## Worktrees and entry guards

Resolve the home worktree and the companion worktrees by the `## Worktrees`
section of the [team-review input](../team-review/references/01-input.md).
Then run entry guards 1 to 4 from its `## Entry guards` section, as written,
in each worktree in scope. In guard 4, the re-run command is
`/team-security docs/plans/<id>/`. Then run guard 5:

5. **REVIEW passed.** Classify the newest `$ARGUMENTS/review-<n>.md` per the
   record states in the [artifact schema](../team/references/artifacts.md).
   When it is missing, FAIL, malformed, or stale, stop before any dispatch.
   Tell the user **"Next: run `/team-review docs/plans/<id>/`"**. Write no
   record.

Guard 5 runs at entry only. Inside one session, the loop keeps running after
its own fix commits make the `review-<n>.md` record stale. The hand-off in
[execution](references/02-execution.md) step 9 then routes the run back through REVIEW.
