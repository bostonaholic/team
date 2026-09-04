---
name: team-research
description: 'Researches a codebase area before changes. Trigger on "research this", "explore the codebase for", or "/team-research".'
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team Research — Answer the Questions

Run the RESEARCH phase only, then stop. The researcher and file-finder
read `2-questions.md` (and optionally `4-repos.md`) — never the user's
original task description.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery command below resolves it.

The dispatched agents receive `$ARGUMENTS/2-questions.md` and (when it
exists) `$ARGUMENTS/4-repos.md`. They do **not** read `1-task.md`.

Resolve `<team-skill-dir>` to the absolute directory containing
`skills/team/SKILL.md`. From the repository root, run:

```sh
"<team-skill-dir>/discover-topic.sh" "${ARGUMENTS:-}" "2-questions.md"
```

- **If the command printed a path**, use it as `$ARGUMENTS` (tier 1 explicit arg,
  or tier 2 discovery). When the path came from tier 2 (no explicit arg),
  announce the resolved directory to the user before proceeding, so an
  auto-picked topic is never silent. Discovery resolves only the directory
  variable — the dispatch step below still forwards exactly
  `{2-questions.md, 4-repos.md?}`.
- **If the command printed nothing** (tier 3 — no directory holds `2-questions.md`),
  do not hard-error. Fire `AskUserQuestion` with a `Setup` header and labeled
  options:
  - **Run the producer** — run `/team-question <description>` to produce the
    missing `2-questions.md`.
  - **Give a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).

## Execution

1. Use the directory resolved in `## Input`.
2. Dispatch `file-finder` and `researcher` in **parallel**, passing each
   the path `$ARGUMENTS/2-questions.md`. If `$ARGUMENTS/4-repos.md` exists,
   include its path too — `4-repos.md` carries scope (which repos and
   where) without leaking intent. Do **not** pass the original
   description, `1-task.md`, or any framing.
3. Combine their returned content into a single `5-research.md` written to
   `$ARGUMENTS/5-research.md` with the necessary frontmatter (see the
   researcher agent for the schema). The `topic` value MUST be read from
   `$ARGUMENTS/2-questions.md`'s frontmatter and copied verbatim — never
   improvised, never combined with the ticket id. In multi-repo mode,
   preserve the repo-slug prefix on every file reference (e.g.
   `frontend:src/App.tsx:42`).
4. **Stop once `$ARGUMENTS/5-research.md` exists** — do not continue to
   DESIGN.

## Scope isolation

- The orchestrator passes the agents only `2-questions.md` (and optionally
  `4-repos.md` for scope). Never `1-task.md`, never the description.
- Agent system prompts forbid reading `1-task.md`. They are allowed to
  read `4-repos.md` because it carries scope, not intent.
- If the agents need context the questions lack, they must surface it as
  an open question rather than guessing intent.

If you suspect leakage (e.g., research references a goal not stated in
`2-questions.md`), treat it as a defect and re-dispatch with a fresh agent.

Report:

- Path to `$ARGUMENTS/5-research.md`
- Key findings (3–5 bullets)
- Open questions count
- Tell the user: **"Next: run `/team-design docs/plans/<id>/`"**
