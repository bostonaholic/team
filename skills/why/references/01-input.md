## Input

`$ARGUMENTS` is the question and its target — a file path, a symbol, a
pattern, or a named decision.

- **Given** — parse the target and the question kind directly from the
  argument.
- **Empty or vague** — infer the target from conversation context: open
  files, recent edits, the code just discussed. **State your
  interpretation in one line before proceeding** so the user can redirect
  if you are off. Do not interrogate; state a best guess.

If the question embeds a hypothesis, treat it as one candidate among
others, never a conclusion to confirm, and check the evidence
independently.
