---
name: team-question
description: Decompose a feature description, ticket, or issue link into the QRSPI Question artifacts (task.md, questions.md). Trigger on "shape this idea", "decompose this task", or "/team-question".
argument-hint: "<ticket id, issue URL, or task description>"
---

# TEAM Question — Decompose the Task

Run the QUESTION phase only, then stop. The Question phase decomposes the
user's intent into two artifacts that the rest of the QRSPI pipeline
consumes:

- `task.md` — the human's full intent. Read by `design-author` and
  downstream phases that need intent. **Never** read by `researcher` or
  `file-finder` (blindness invariant).
- `questions.md` — neutral research questions phrased without intent. The
  only file `researcher` and `file-finder` ever read.

Both files live in `docs/plans/<id>/` where `<id>` is either a
ticket-derived slug (`ENG-1234-add-rate-limiting`) or a date-derived slug
(`2026-05-01-add-rate-limiting`).

## Input

`$ARGUMENTS` may be:

- A ticket identifier (e.g. `ENG-1234`) — recorded as `ticketId` on
  `task.md`'s frontmatter. The orchestrator does not call any ticketing
  system; the ID is stored for the user's reference.
- An issue URL (e.g. `https://github.com/org/repo/issues/42`) — fetched
  with `gh issue view` (or equivalent) to extract the title and body
  before decomposition.
- Free-form text — treated directly as the feature/task description.

If `$ARGUMENTS` is empty, ask the user to describe what they want and stop.

## Execution

1. **Resolve the input** to a description:
   - Ticket-only: ask the user for context, or use any tracker integration
     they have configured to fetch the issue body.
   - Issue URL: run `gh issue view <url> --json title,body` and use the
     title plus body as the description.
   - Free text: use directly.
2. **Derive `<id>`**:
   - If a ticket identifier is present: `<TICKET>-<kebab-topic>` (e.g.,
     `ENG-1234-add-rate-limiting`).
   - Otherwise: `<YYYY-MM-DD>-<kebab-topic>` (e.g.,
     `2026-05-01-add-rate-limiting`).
   - The `<kebab-topic>` is a 2–4 word kebab-case slug derived from the
     description.
3. **Create `docs/plans/<id>/`** if it does not exist.
4. **Resume detection.** If `docs/plans/<id>/task.md` already exists,
   re-read it instead of overwriting; if `questions.md` is missing, the
   questioner only writes `questions.md`.
5. Dispatch the `questioner` agent with the full description and the
   target directory `docs/plans/<id>/`. The agent writes `task.md` and
   `questions.md` to that directory.
6. **Stop once both artifacts exist on disk** — do not continue to RESEARCH.

## When to use

- The idea is vague and you want to see the questioner's framing before
  committing to research.
- You want to review and edit `task.md` / `questions.md` by hand before
  research begins.
- You want to run multiple research passes against the same task without
  re-decomposing.

## Completion

Report:

- Path to `task.md` and `questions.md`
- Topic slug and `<id>`
- Tell the user: **"Next: run `/team-research docs/plans/<id>/`"**
