## Standalone Mode Tradeoffs

Standalone mode skips the Question/Research/Design/Structure/Plan
ceremony. You forfeit isolated research, human design alignment, and
explicit slice breakdown. Use it when:

- The work is well-scoped and tracked in a ticket with clear acceptance
- You have already decided the approach and want test-first execution
- The change is small enough that QRSPI artifacts would be overhead

For larger features, prefer `/team` (full pipeline) for the alignment gates.

How the phase ends depends on how it was entered:

- **Full pipeline** (the TodoWrite ledger carries a `PR` phase item —
  `/team` seeded it): present all review verdicts, then continue straight
  into the PR phase: call the Skill tool with `team-pr` — push the branch and
  open the draft PR in the same turn. Ending the turn with verdicts but
  no draft PR is a defect.
- **Standalone**: present all review verdicts and tell the user:
  **"Next: run `/team-pr docs/plans/<id>/`"**
