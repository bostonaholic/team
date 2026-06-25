---
name: team-research
description: Research a codebase area before making changes. Dispatches parallel read-only agents (file-finder + researcher) that read questions.md only — never task.md. Trigger on "research this", "explore the codebase for", or "/team-research".
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team Research — Answer the Questions

Run the RESEARCH phase only, then stop. The researcher and file-finder
read `questions.md` (and optionally `repos.md`) — never the user's
original task description.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery block below resolves it.

The dispatched agents receive `$ARGUMENTS/questions.md` and (when it
exists) `$ARGUMENTS/repos.md`. They do **not** read `task.md`.

Resolve the artifact directory by running this self-contained block (one bash
call — agent threads reset cwd between calls):

```sh
# Three-tier artifact-directory discovery (archetype A) — shared script.
# Single source: skills/qrspi-workflow/discover-topic.sh (was duplicated 8x).
# Args: <pred> <require_approved> <explicit_dir>; scans docs/plans/ in cwd.
bash "${CLAUDE_PLUGIN_ROOT}/skills/qrspi-workflow/discover-topic.sh" "questions.md" "" "$ARGUMENTS"
```

- **If the block printed a path**, use it as `$ARGUMENTS` (tier 1 explicit arg,
  or tier 2 discovery). When the path came from tier 2 (no explicit arg),
  announce the resolved directory to the user before proceeding, so an
  auto-picked topic is never silent. Discovery resolves only the directory
  variable — the dispatch step below still forwards exactly
  `{questions.md, repos.md?}`.
- **If the block printed nothing** (tier 3 — no directory holds `questions.md`),
  do not hard-error. Fire `AskUserQuestion` with a `Setup` header and labeled
  options:
  - **Run the producer** — run `/team-question <description>` to produce the
    missing `questions.md`.
  - **Provide a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).

## Execution

> Follow `skills/progress-tracking/SKILL.md`: when this procedure has two or more steps, seed one todo item per step before starting and mark each complete as you go.

1. Use the directory resolved in `## Input`.
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

## Scope isolation

- The orchestrator passes the agents only `questions.md` (and optionally
  `repos.md` for scope). Never `task.md`, never the description.
- Agent system prompts forbid reading `task.md`. They are allowed to
  read `repos.md` because it carries scope, not intent.
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
