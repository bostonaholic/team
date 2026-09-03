---
name: team-design
description: Draft and adversarially review the design. Trigger on "design this", "let's align on the approach", or "/team-design".
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team Design

Run DESIGN only. The design author resolves open choices as recorded
assumptions; a fresh reviewer gates advancement. Never prompt mid-run.

## Resolve input

Pass the exact `$ARGUMENTS` as stdin data to:

```sh
node "<skill-dir>/../artifact-frontmatter/scripts/resolve-topic.mjs" --argument-stdin --predecessor 5-research.md
```

An explicit existing directory wins; otherwise announce the newest topic with
`5-research.md`. On `{"status":"needs-input"}`, use `AskUserQuestion` with a
`Setup` header: run `/team-research docs/plans/<id>/`, provide a directory, or
cancel.

## Procedure

Call the Skill tool with `principle-progress-tracking` and follow it.

1. Require `1-task.md`, `2-questions.md`, and `5-research.md`.
2. If `6-design.md` is absent, dispatch `design-author` with those artifacts. It
   records self-resolved choices under `## Decisions made` as assumptions and
   writes `6-design.md` with `revision: 0`. Preserve an existing draft.
3. If the highest numbered `design-review-<n>.md` has frontmatter verdict
   `APPROVE` or `COMMENT`, stop; never review an already passed draft.
4. Before every needed review round, call the Skill tool with
   `cross-model-review` and run its Design-review pass. That skill owns CLI
   detection, one courier per ready vendor, DATA fencing, inline fallback,
   `TEAM_DISABLE_CROSS_MODEL`, and loud skip reporting. Append capture records
   to `cross-model-raw.md`; zero calls append nothing. This optional pass never
   blocks the reviewer.
5. Call the Skill tool with `reviewing-designs`. Dispatch its `## Review brief`
   to a fresh-context read-only reviewer with the artifact directory
   substituted. Write the complete report to the next
   `design-review-<n>.md`; never overwrite a round. Derive frontmatter from the
   report's last verdict token. If present, append its
   `### Cross-model disposition` to `cross-model-notes.md`, blockquoting every
   line and prepending `> **Design round <n>**`; follow `artifact-frontmatter`
   for first-write frontmatter.
6. Act only on the recorded verdict:
   - `APPROVE` or `COMMENT`: pass.
   - `REQUEST CHANGES`: give the findings verbatim to `design-author`; it
     revises the draft and increments `revision`, then repeat from step 4.
   - missing/unparseable verdict or reviewer crash: retry that review once,
     then halt loudly. Unknown never passes.

The revision loop has no round cap. An interrupted run preserves its draft and
review records and resumes at the first incomplete step.

## Completion

Verify `6-design.md` exists and the latest review verdict passes. Report both
paths and: `Next: run /team-structure docs/plans/<id>/`.
