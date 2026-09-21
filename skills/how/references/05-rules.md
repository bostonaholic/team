Before workflow work, read [initialization boundary](../team/references/skill-dispatch.md). Only the invoking root may initialize its private packaged runtime; subagents inherit it.

Before invocation or continuation, read [skill dispatch](../team/references/skill-dispatch.md); apply its installation-aware continuation and self-resume rules.

## Rules

- **Read-only workflow.** After root initialization, no writes, no artifacts under `docs/plans/`, no
  state-changing commands, here or in any subagent.
- **Explain before critiquing.** Critique mode never skips the
  explanation.
- **Cite, don't gesture.** Claims about code carry `file:line`; a flow
  step names the function that runs it.
- **No incidentals.** Give the mechanism and its evidence. Do not narrate
  the exploration or add background the question did not raise.
- When the question is about motivation or history rather than
  mechanics, Invoke Team skill `why` instead — mechanics and
  motivation are different investigations.
