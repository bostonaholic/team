## The Phase Loop

```
loop:
  1. Inspect TodoWrite. If all phases are completed → exit.
  2. Identify the in_progress phase. Look it up in the phase table to
     get the expected agent(s) and predecessor artifact path(s).
  3. Verify predecessor artifacts exist on disk (for STRUCTURE, that
     includes a `design-review-<n>.md` with a passing verdict). If missing,
     report a desync and suggest re-invoking the same /team-* command.
  4. Dispatch the agent(s) (parallel where the phase table marks them).
     Subagents never pause for user input — each resolves its own open
     questions and records them as assumptions in its artifact.
     Dispatch so the agent's result comes back to you **in full**. Some
     dispatch modes return only a truncated notice and hold the body
     elsewhere; that loses a return-only agent's entire output (see
     "Where a phase agent's output lives" below).
  5. Write each returned artifact to docs/plans/<id>/<name>.md
     with the YAML frontmatter the agent specifies (see the agent file
     and skills/artifact-frontmatter/SKILL.md).
  6. Run the gate for this phase:
     - REVIEW (design): dispatch the adversarial design review (see
       "Design Review Gate (design)" below); write the verdict to
       `design-review-<n>.md`. On APPROVE or COMMENT, advance. On
       REQUEST CHANGES, re-dispatch design-author with the findings
       verbatim and `revision: <n+1>`; a fresh review round follows.
     - MECHANICAL (tests-failing): run the suite; on assertion-only
       failure, advance.
     - ROUTER-EMIT (worktree, PR): perform the action.
     - AGGREGATE (5 reviewers): dispatch in parallel, collect results,
       sort findings into severity tiers; auto-loop while any Blocking or
       Major finding remains (never consulting the user), tracking the
       round count in TodoWrite; record Minor-and-below for the PR body's
       `## Review notes`.
  7. Update TodoWrite — mark current phase `completed` and the next one
     `in_progress`.
  8. Goto loop.
```

### Phase table

| Phase      | Agent(s)                                                | Predecessor artifact                                            | Next phase on pass |
|------------|---------------------------------------------------------|-----------------------------------------------------------------|--------------------|
| WORKTREE   | (orchestrator-emit)                                     | (none — description in `$ARGUMENTS`)                            | QUESTION           |
| QUESTION   | `questioner`                                            | worktree prepared (+ description in `$ARGUMENTS`)               | RESEARCH           |
| RESEARCH   | `file-finder`, `researcher` (parallel, isolated)        | `docs/plans/<id>/2-questions.md`                                  | DESIGN             |
| DESIGN     | `design-author` (→ design review)                       | `docs/plans/<id>/5-research.md`                                   | STRUCTURE          |
| STRUCTURE  | `structure-planner`                                     | `docs/plans/<id>/6-design.md` + passing `design-review-<n>.md`    | PLAN               |
| PLAN       | `planner`                                               | `docs/plans/<id>/7-structure.md`                                  | IMPLEMENT          |
| IMPLEMENT  | `test-architect`, `implementer`, 5 reviewers (parallel) | `docs/plans/<id>/8-plan.md`                                       | PR                 |
| PR         | (orchestrator-emit)                                     | aggregate gate passed                                           | SHIPPED            |

For RESEARCH, dispatch `file-finder` and `researcher` in parallel passing
each only the `docs/plans/<id>/2-questions.md` path. Combine their returned
content into a single `docs/plans/<id>/5-research.md` artifact (with the
frontmatter the researcher's documentation specifies) before advancing.

`skills/team/registry.json` is an inventory of the 13 specialist agents
for documentation purposes only. The orchestrator dispatches based on
the phase table above, not on registry contents.
