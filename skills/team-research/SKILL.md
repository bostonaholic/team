---
name: team-research
description: Research questions with isolated read-only agents. Trigger on "research this", "explore the codebase for", or "/team-research".
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team Research

Run RESEARCH only. `file-finder` and `researcher` see neutral questions, never
the user's desired outcome.

## Resolve input

Pass the exact `$ARGUMENTS` as stdin data to:

```sh
node "<skill-dir>/../artifact-frontmatter/scripts/resolve-topic.mjs" --argument-stdin --predecessor 2-questions.md
```

An explicit existing directory wins. Otherwise use the newest conforming topic
containing `2-questions.md`; announce an auto-selected directory. On
`{"status":"needs-input"}`, use `AskUserQuestion` with a `Setup` header:
run `/team-question <description>`, provide a directory, or cancel.

## Procedure

Call the Skill tool with `principle-progress-tracking` and follow it.

1. Require `2-questions.md`; read its `topic`. Read `4-repos.md` only when present.
2. Dispatch fresh `file-finder` and `researcher` agents in parallel. Pass only
   `2-questions.md` and optional `4-repos.md` paths. Do not pass the description,
   `1-task.md`, or any framing.
3. Combine their evidence into `5-research.md`. Copy `topic` verbatim, include
   required frontmatter, preserve repo-slug prefixes on multi-repo file
   citations, and leave unsupported questions open.
4. If output reveals intent absent from `2-questions.md`, discard it and repeat
   with fresh agents.
5. Verify `5-research.md` exists; stop before DESIGN.

## Completion

Report the path, 3–5 key findings, open-question count, and:
`Next: run /team-design docs/plans/<id>/`.
