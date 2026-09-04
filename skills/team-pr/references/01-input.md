## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery command below resolves it for the **resume** path (discovery only
augments resume — the standalone path is unchanged).

The PR description is grounded in `$ARGUMENTS/6-design.md`. The ticket
identifier (if any) is read from `$ARGUMENTS/1-task.md`'s frontmatter.

Resolve `<team-skill-dir>` to the absolute directory containing
`skills/team/SKILL.md`. From the repository root, run:

```sh
"<team-skill-dir>/discover-topic.sh" "${ARGUMENTS:-}" "6-design.md"
```

- **If the command printed a path**, use it as `$ARGUMENTS` for the resume
  path. That is tier 1 explicit arg, or tier 2 discovery of a directory
  holding `6-design.md`. When the path came from tier 2, with no explicit
  arg, announce the resolved directory to the user first, so an auto-picked
  topic is never silent.
- **If the command printed nothing** (tier 3 — no matching directory), do not
  hard-error. The working tree can still have commits to ship. Fall through
  to the **Standalone path** in `## Execution`. It detects the base branch
  (archetype B) and stops with "Nothing to ship." only when there is
  nothing ahead of the base.
