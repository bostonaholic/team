---
name: team-question
description: 'Use for decomposing features into tasks and research questions. Produces task and question artifacts.'
effort: medium
argument-hint: "<ticket id, issue URL, or task description>"
---

Before each dispatch or retry, read [host dispatch](../team/references/15-host-dispatch.md) and supply its resolved installed paths.
Before artifact work, read [artifact schema](../team/references/artifacts.md).
Before handling external values, read [external-data rules](../team/references/external-data.md).

# Team Question

Before finalizing prose you author, read the [writing standards](../team/references/writing.md).

Run the QUESTION phase only, then stop. The phase writes, in `docs/plans/<id>/`:

- `1-task.md` — the human's full intent. **Never** read by `researcher` or
  `file-finder`.
- `2-questions.md` — neutral research questions phrased without intent. The
  only file `researcher` and `file-finder` ever read.
- `3-prd.md` — **only when the request is vague, multi-story, cross-cutting,
  or replaces existing behavior** (criteria: `## Conditional PRD` in
  `skills/team/playbooks/question.md`).
- `4-repos.md` — **only when the topic spans more than one repository**.
  Lists each involved repo's slug, absolute path, and role.

## Execution

1. **Resolve `$ARGUMENTS`** to a description:
   - Empty: **discover, do not demand.** Read recent `git log` activity and
     the repo's `README` / `CLAUDE.md` to propose a likely topic, then use
     `AskUserQuestion` with labeled options to fill any genuine gap in
     intent. Never bare-stop with a plain "describe it" demand when context
     is already available.
   - Ticket-only: ask the user for context, or use any tracker integration
     they have configured to fetch the issue body.
   - Issue URL: run `gh issue view <url> --json title,body` (or equivalent)
     and use the title plus body as the description.
   - Free text: use directly.

   A ticket identifier (e.g. `ENG-1234`) is recorded as `ticketId` on
   `1-task.md`'s frontmatter. The orchestrator does not call any ticketing
   system.
2. **Derive `<id>`**: `<TICKET>-<kebab-topic>` if a ticket identifier is
   present, otherwise `<YYYY-MM-DD>-<kebab-topic>`. The `<kebab-topic>` is a
   2–4 word kebab-case slug derived from the description.
3. **Create `docs/plans/<id>/`** if it does not exist.
4. **Resume detection.** If `docs/plans/<id>/1-task.md` already exists,
   re-read it instead of overwriting. If `2-questions.md` is missing, the
   questioner only writes `2-questions.md`.
5. Dispatch the `questioner` agent with the full description and the
   target directory `docs/plans/<id>/`. It writes the artifacts above —
   `4-repos.md` when it makes sure with the user that the topic spans
   multiple repos.
6. **Stop once `1-task.md` and `2-questions.md` exist on disk** — do not
   continue to RESEARCH. (`3-prd.md` or `4-repos.md` can also exist, neither
   changes the stop condition.)

Report:

- Path to `1-task.md` and `2-questions.md` (and `3-prd.md` / `4-repos.md` when
  written)
- Topic slug and `<id>`
- Mode: single-repo or multi-repo (with the involved repo slugs if
  multi-repo)
- Tell the user: **"Next: run `/team-research docs/plans/<id>/`"**
