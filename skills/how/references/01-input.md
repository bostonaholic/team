## Input

`$ARGUMENTS` is the question — a subsystem ("the rate limiter"), a
feature flow ("what happens when a user submits the form"), or a
placement question ("where should this validation live"). Two resolution
paths:

- **Given** — parse the target and scope directly from the argument.
- **Empty or vague** — infer the target from conversation context: open
  files, recent edits, what was just discussed. **State your
  interpretation in one line before exploring** so the user can redirect
  if you are off. Do not ask first; a stated best guess beats a
  questionnaire.

Choose the mode from the ask: a request for problems, issues, or
improvements ("critique the architecture", "what's wrong with this
design") selects Critique; everything else is Explain.
