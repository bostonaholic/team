## Open Questions to Flag

- If the PR holds both the user's own comments and reviewer comments,
  confirm if self-comments count as open items to address.

List the `Auto-applied` items first — each with its confidence and
landing commit SHA. Then end the turn with a short hand-off prompt for
the `Needs your decision` items, for example:

> "Tell me which items to address and which option to take for each
> (default: the recommendation). I will not touch anything else until
> you agree."

Executing the chosen actions is a separate, follow-up turn.
