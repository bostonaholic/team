### Step 10 — Verify by re-querying, never by memory

Assert the invariants the run was meant to establish by re-reading the authoritative tracker
value, the way `.claude/scripts/project-set-status.sh` does on this repo's own board: a zero
exit from the write means the mutation was accepted, not that the change landed. A mutation
that timed out, a close included, is re-read and retried — never assume a timed-out write
failed, and never assume it succeeded. A link is verified by re-reading it from the blocked
issue and confirming the direction, not merely that an edge exists between the two. A
closure is verified by re-query too: the state, the resolution label, and the evidence
comment. Never move the card by hand — the board automation lands it in Done. Record each landed
step in `$RUN_DIR/8-plan.md`. A failure mid-plan stops the run, reports which steps landed and
which remain, and never rolls back silently.
The step applies `principle-evidence-over-assertion`: a verdict rests on
a re-queried authoritative value, never on memory or on a write's zero exit.
