# Boil the ocean

Finish the whole authorized job, not the part that turns the tests green.

Fix the cause, not the symptom. A workaround, a guard that silences the failure, or a note to revisit while the real fix is in reach is a defect.
Search for an existing implementation before building a new one ([dependency rules](../references/dependencies.md)).
Test before shipping: a slice is done when its acceptance tests pass, not when it compiles.
Document the behavior and decisions a change adds where their consumers will read them.
Return the finished product when the authorized work is finishable, not a plan to finish it.
Leave no thread the authorized scope opens dangling when tying it off is within reach.

## Completeness stays inside the authorized scope

- Apply the delivered-code standards in [code standards](../references/code-standards.md).
- Record adjacent defects, refactors, and unapproved features instead of performing them ([focused work rules](focused-work.md)).
- A correctness fix outside the approved scope returns through its review; it is not folded in for being cheap ([human control rules](human-control.md)).
