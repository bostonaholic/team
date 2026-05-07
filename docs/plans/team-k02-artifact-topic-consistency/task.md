---
topic: artifact-topic-consistency
date: 2026-05-07
phase: task
ticketId: team-k02
---

# Task: artifact-topic-consistency

## Description

Pipeline agents produce inconsistent `topic` frontmatter values across
artifacts in the same `docs/plans/<id>/` directory.

Illustrative example for `<id>` = `ENG-9876-cache-invalidation`:

- `task.md`: `topic: cache-invalidation` (correct)
- `questions.md`: `topic: ENG-9876` (wrong — ticket id used as topic)
- `research.md`: `topic: ENG-9876 cache invalidation` (wrong —
  mash of id + topic, not kebab-case)

Per `skills/qrspi-workflow/SKILL.md:116`, all artifacts in the same
directory should carry the same kebab-case `topic` slug, equal to the
kebab portion of `<id>` (i.e. `<id>` minus the `<TICKET>-` or
`<YYYY-MM-DD>-` prefix).

## Stated goal

Stop the agents producing inconsistent `topic` values.

## Inferred goal

Make the topic-consistency invariant unambiguous in the prompts, and
document the rationale for `ticketId` living only on `task.md` (which
is by design, not a bug, per the frontmatter table).

## Acceptance signals

- `agents/questioner.md` explicitly states `topic` must be identical
  across `task.md` and `questions.md`, and equals the kebab portion of
  `<id>`.
- `agents/researcher.md` (or the orchestrator-side `team-research`
  skill) tells the orchestrator what `topic` value to write to
  `research.md` — i.e. read it from `questions.md`.
- `skills/qrspi-workflow/SKILL.md` carries an explicit topic-
  consistency invariant and a one-line rationale for `ticketId`
  appearing only on `task.md`.
- A bash test asserts each of the above.

## Open assumptions

- The fix is documentation/prompt clarification only — no code change.
- The existing bash-grep test pattern in `tests/` is the right place
  for the verification test.
