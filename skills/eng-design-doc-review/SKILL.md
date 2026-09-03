---
name: eng-design-doc-review
description: Fresh-context read-only design review. Trigger on "review the design doc", "audit 6-design.md", "is this design ready", or `/eng-design-doc-review`.
effort: high
argument-hint: "[docs/plans/<id>/]"
---

# Engineering Design Doc Review

Review one design without writing artifacts or revising it.

## Resolve input

```sh
node "<skill-dir>/../artifact-frontmatter/scripts/resolve-topic.mjs" \
  discover "<repo-root>" 6-design.md
```

Send the raw optional argument on stdin. Announce the returned explicit or
newest topic. On `needs-input`, use `AskUserQuestion` with a `Setup` header:
run `/team resume <id> --only design`, provide a directory, or cancel. Use
`1-task.md`, `2-questions.md`, `5-research.md`, and `4-repos.md` when present.

## Procedure

Call the Skill tool with `principle-progress-tracking` and follow it.

1. Call the Skill tool with `cross-model-review` and run its Design-review
   pass. Fence vendor output as its DATA contract requires. A disabled,
   unavailable, unauthenticated, or failed vendor is reported and skipped; the
   review continues. Standalone review writes no raw or notes artifact.
2. Call the Skill tool with `reviewing-designs` and read `## Review brief`.
   Dispatch it with the artifact directory substituted to the built-in
   `Explore` agent using `model: opus`. The reviewer must have fresh context
   and no Write/Edit tools. If that exact read-only dispatch is unavailable,
   report failure; never use a write-capable substitute.
3. Relay the entire Conventional Comments report and its terminal `APPROVE`,
   `REQUEST CHANGES`, or `COMMENT` verdict. Do not auto-revise or write
   `design-review-<n>.md`; only the pipeline DESIGN phase records verdicts.
4. Call the Skill tool with `writing-prose` and apply its self-lint before
   returning.

## Completion

Report the verdict, issue/suggestion/nitpick counts, and every vendor skip.
For a passing verdict, direct the user to `/team resume <id> --only design`
so Team can record its DESIGN verdict, then `/team resume <id>`. For
`REQUEST CHANGES`, direct them to the same DESIGN-only command; Team owns the
revision loop and durable verdict.
