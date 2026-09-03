---
name: team-research
description: Internal RESEARCH module for Team. Given one explicit artifact directory containing 2-questions.md, dispatch isolated read-only research and write 5-research.md without exposing task intent or running Design.
user-invocable: false
effort: medium
argument-hint: "<absolute docs/plans/<id>/ directory>"
---

# Team Research

Run RESEARCH only. `$ARGUMENTS` must be one existing absolute
`docs/plans/<id>/` directory. Require `2-questions.md`; do not search for a topic
or run its producer.
Follow `skills/principle-progress-tracking/SKILL.md` for this procedure.

1. If valid `5-research.md` already exists, return it unchanged.
2. Dispatch fresh `file-finder` and `researcher` agents in parallel. Pass only
   `$ARGUMENTS/2-questions.md` and, when present, `$ARGUMENTS/4-repos.md`.
3. Never pass or mention `1-task.md`, the request, or goal framing. The agents
   may read `4-repos.md` for scope. Missing context becomes an open question.
4. Require both complete returns. A truncated or missing return is a failed
   dispatch, not research evidence.
5. Combine them into `$ARGUMENTS/5-research.md`. Copy `topic` verbatim from
   `2-questions.md`; preserve repo-slug prefixes on multi-repo file citations.
6. If the report reveals goal knowledge absent from `2-questions.md`, discard it
   and repeat with fresh agents.

Return the research path, key findings, and open-question count. Stop; the
coordinator decides whether DESIGN runs.
