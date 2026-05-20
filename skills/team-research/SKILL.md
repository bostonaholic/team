---
name: team-research
description: Research a codebase area before making changes. Dispatches parallel read-only agents (file-finder + researcher) that read questions.md only — never task.md. Trigger on "research this", "explore the codebase for", or "/team-research".
argument-hint: "docs/plans/<id>/"
---

# Team Research — Answer the Questions

Run the RESEARCH phase only, then stop. Research is **blind** — the
researcher and file-finder never see the user's original task description.
They read `questions.md` and nothing else.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`.

The dispatched agents receive `$ARGUMENTS/questions.md` and (when it
exists) `$ARGUMENTS/repos.md`. They do **not** read `task.md`. If
`$ARGUMENTS` is empty or the directory does not exist, ask the user to
provide an artifact directory (typically the one printed by
`/team-question`) and stop.

## Execution

1. **Verify** `$ARGUMENTS/questions.md` exists. If missing, tell the user
   to run `/team-question <description>` first and stop.
2. Dispatch `file-finder` and `researcher` in **parallel**, passing each
   the path `$ARGUMENTS/questions.md`. If `$ARGUMENTS/repos.md` exists,
   include its path too — `repos.md` carries scope (which repos and
   where) without leaking intent. Do **not** pass the original
   description, `task.md`, or any framing.
3. Combine their returned content into a single `research.md` written to
   `$ARGUMENTS/research.md` with the required frontmatter (see the
   researcher agent for the schema). The `topic` value MUST be read
   from `$ARGUMENTS/questions.md`'s frontmatter and copied verbatim —
   never improvised, never combined with the ticket id. In multi-repo
   mode, preserve the repo-slug prefix on every file reference (e.g.
   `frontend:src/App.tsx:42`).
4. **Stop once `$ARGUMENTS/research.md` exists** — do not continue to
   DESIGN.

## Blindness invariant

- The orchestrator passes blind agents only `questions.md` (and
  optionally `repos.md` for scope). Never `task.md`, never the
  description.
- Blind agent system prompts forbid reading `task.md`. They are allowed
  to read `repos.md` because it carries scope, not intent.
- If the agents need context the questions lack, they must surface it as
  an open question rather than guessing intent.

If you suspect leakage (e.g., research references a goal not stated in
`questions.md`), treat it as a defect and re-dispatch with a fresh agent.

## Completion

Report:

- Path to `$ARGUMENTS/research.md`
- Key findings (3–5 bullets)
- Open questions count
- Tell the user: **"Next: run `/team-design docs/plans/<id>/`"**
