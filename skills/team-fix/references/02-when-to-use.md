## When to Use

Use `/team-fix` when the bug is well-understood, the affected code is known,
the fix is likely contained to a few files, and no architectural decision is
needed.

Use `/team` (full QRSPI pipeline) when the root cause is unknown and needs
investigation, the fix requires designing new behavior or APIs, multiple
subsystems may be involved, or the user wants to align on the approach before
code is written.
