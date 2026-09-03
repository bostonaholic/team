---
name: team-plan
description: Create the tactical implementation plan. Trigger on "plan the implementation", "spell out the steps", or "/team-plan".
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team Plan

Run PLAN only. This phase has no approval gate.

## Resolve input

Pass the exact `$ARGUMENTS` as stdin data to:

```sh
node "<skill-dir>/../artifact-frontmatter/scripts/resolve-topic.mjs" --argument-stdin --predecessor 7-structure.md
```

An explicit existing directory wins; otherwise announce the newest topic with
`7-structure.md`. On `{"status":"needs-input"}`, use `AskUserQuestion` with a
`Setup` header: run `/team-structure docs/plans/<id>/`, provide a directory, or
cancel.

## Procedure

Call the Skill tool with `principle-progress-tracking` and follow it.

1. Require `7-structure.md`, `6-design.md`, and `5-research.md`.
2. Dispatch `planner`. It writes `8-plan.md` with file-level steps and maps each
   slice to acceptance checks.
3. Verify `8-plan.md` exists; stop before WORKTREE.

## Completion

Report the plan path and:
`Next: run /team-worktree docs/plans/<id>/`.
