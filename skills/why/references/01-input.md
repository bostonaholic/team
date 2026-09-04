## Input

`$ARGUMENTS` is the question and its target — a file path, a symbol, a
pattern, or a named decision (for example: `why does the retry cap sit at
3 in services/queue.ts`). Two resolution paths:

- **Given** — parse the target (files, symbols) and the question kind
  (design rationale, trade-off, edge-case motivation, dead-code
  suspicion, broad history) directly from the argument.
- **Empty or vague** — infer the target from conversation context: open
  files, recent edits, the code just discussed. **State your
  interpretation in one line before proceeding** so the user can redirect
  if you are off. Do not interrogate; a stated best guess beats a
  questionnaire.

If the user's question embeds a hypothesis ("I assume this is for
performance?"), treat it as one candidate among others, never a
conclusion to confirm. Check the evidence independently and report what
the record actually supports.
