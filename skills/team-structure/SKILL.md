---
name: team-structure
description: Create reviewed-design vertical slices. Trigger on "slice this up", "break the design into steps", or "/team-structure".
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team Structure

Run STRUCTURE only. This phase has no approval gate.

## Resolve input

Pass the exact `$ARGUMENTS` as stdin data to:

```sh
node "<skill-dir>/../artifact-frontmatter/scripts/resolve-topic.mjs" --argument-stdin --predecessor 6-design.md --require-design-review
```

An explicit existing directory wins; otherwise announce the newest topic whose
latest `design-review-<n>.md` frontmatter verdict is `APPROVE` or `COMMENT`. On
`{"status":"needs-input"}`, use `AskUserQuestion` with a `Setup` header:
run `/team-design docs/plans/<id>/`, provide a directory, or cancel.

## Procedure

Call the Skill tool with `principle-progress-tracking` and follow it.

1. Revalidate the explicit directory too: the highest numbered review must
   contain `verdict: APPROVE` or `verdict: COMMENT` in YAML frontmatter. Missing,
   unreadable, or `REQUEST CHANGES` means stop and report the design unreviewed.
2. Dispatch `structure-planner` with `6-design.md`, `5-research.md`, and `1-task.md`.
   It writes vertical slices to `7-structure.md` using the artifact-frontmatter
   schema.
3. Verify `7-structure.md` exists. Do not request approval; stop before PLAN.

## Completion

Report the structure path and, when standalone:
`Next: run /team-plan docs/plans/<id>/`.
