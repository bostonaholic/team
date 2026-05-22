---
name: team-design-review
description: Adversarially review a technical design document with fresh context before the human gate. Dispatches the `design-doc-reviewer` agent (read-only) against `docs/plans/<id>/design.md` and presents its verdict — APPROVE, REQUEST CHANGES, or COMMENT. Optional, not part of the QRSPI pipeline. Trigger on "review the design doc", "audit design.md", "is this design ready", or `/team-design-review`.
argument-hint: "docs/plans/<id>/"
---

# Team Design Review — Independent Audit Before the Human Gate

Run the `design-doc-reviewer` agent against a design document. This is an
**optional** review step — it is not part of the QRSPI phase table and
adds no gate to the orchestrator. Invoke it when you want an independent,
fresh-context audit before you walk into the DESIGN human gate.

The agent operates with **no shared conversation history** with the
design-author. That isolation is the whole point — it prevents
self-evaluation bias.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`.

The agent reads:

- `$ARGUMENTS/design.md` — the document under review (required)
- `$ARGUMENTS/task.md`, `$ARGUMENTS/questions.md`,
  `$ARGUMENTS/research.md`, `$ARGUMENTS/repos.md` — predecessor artifacts
  (read for grounding when present; missing siblings are not a hard error)

If `$ARGUMENTS/design.md` is missing, tell the user to run
`/team-design docs/plans/<id>/` first and stop.

## Execution

1. **Verify** `$ARGUMENTS/design.md` exists.
2. **Dispatch the agent** by name — `design-doc-reviewer`. It boots with
   four preloaded skills (`technical-design-doc`, `code-review`,
   `engineering-standards`, `documenting-decisions`) and walks its review
   process unaided.
3. **Present the verdict in full.** The agent returns Conventional
   Comments findings (issue / suggestion / nitpick, each with a
   `file:line` reference) followed by one of:
   - **APPROVE** — no blocking issues.
   - **REQUEST CHANGES** — blocking issues found; the design-author
     should revise before the human gate.
   - **COMMENT** — non-blocking suggestions only.
4. **Do not auto-revise.** This skill does not loop the design-author.
   On `REQUEST CHANGES`, surface the findings and let the user decide
   whether to re-enter `/team-design` with that feedback.

## Rules

- This skill is **read-only**. It dispatches a read-only agent and
  produces a report; it does not modify `design.md` or the artifact
  directory.
- The skill does NOT touch the `approved` / `approved_at` frontmatter
  on `design.md`. The human gate in `/team-design` is the only thing
  that flips those fields. An APPROVE verdict from this skill is an
  advisory signal, not a pipeline gate.
- The skill does NOT block `/team-design` or `/team-structure`. Users
  may run those without ever invoking this skill.

## Completion

Print the agent's verdict and the count of issue / suggestion / nitpick
findings. If the verdict is APPROVE or COMMENT, tell the user:
**"You can proceed to the `/team-design` human gate."**
If the verdict is REQUEST CHANGES, tell the user:
**"Re-run `/team-design docs/plans/<id>/` with the findings above to
re-dispatch `design-author` for a revision."**
