---
name: team-question
description: Internal QUESTION module for Team. Given one explicit artifact directory containing 1-task.md, derive neutral research questions and optional PRD/repository scope without running Research or choosing another topic.
user-invocable: false
effort: medium
argument-hint: "<absolute docs/plans/<id>/ directory>"
---

# Team Question

Run QUESTION only. `$ARGUMENTS` must be one existing absolute
`docs/plans/<id>/` directory. Reject anything else; do not search for a topic.

Require `1-task.md` with valid frontmatter, `workflow: team` (or no workflow on
a legacy run), and a non-empty `## Request`. The `team` or `team-fix`
coordinator wrote this intent record. Preserve it verbatim.
Follow `skills/principle-progress-tracking/SKILL.md` for this procedure.

1. If `2-questions.md` already exists with the same `topic`, return it without
   rewriting.
2. Dispatch `questioner` with `1-task.md` and the artifact directory. Tell it to
   preserve `1-task.md` and write:
   - `2-questions.md`: neutral research questions. It may name codebase files,
     modules, and vocabulary, but must not reveal the requested outcome.
   - `3-prd.md` only when `product-requirements-doc` criteria apply.
   - `4-repos.md` only when the topic spans repositories. Paths must be absolute
     sibling git repositories with unique slugs.
3. Resolve open choices autonomously and record assumptions; never prompt the
   user mid-run.
4. Verify `2-questions.md` exists, its `topic` matches `1-task.md`, and it does not
   contain the request text. Fail loudly on missing or inconsistent output.

Return the written artifact paths and single-/multi-repo mode. Stop; the
coordinator decides whether RESEARCH runs.
