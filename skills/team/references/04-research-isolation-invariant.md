## Research Isolation Invariant

The questioner is the only agent that ever sees the raw description from
`$ARGUMENTS`. When dispatching the questioner, pass the full description.
When the questioner returns:

1. Make sure that `1-task.md` and `2-questions.md` exist in `docs/plans/<id>/`.
   The questioner writes them directly with the necessary YAML frontmatter
   (see the agent file).
2. Mark Question complete in TodoWrite and Research `in_progress`.

When dispatching `file-finder` and `researcher`, pass them only the path
`docs/plans/<id>/2-questions.md`. They are forbidden from reading `1-task.md`
and the orchestrator must not give the original description in their
context.
