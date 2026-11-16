## When to Use

`/team-fix`: the bug is well understood, the affected code known, the fix
likely contained to a few files, and no architectural decision needed.

`/team fix` (root cause, then full QRSPI): the bug's root cause needs
investigation, the fix designs new behavior or APIs, multiple subsystems may
be involved, or the user wants to align on the approach first.

`/team` (full QRSPI): the work is not a bug.
