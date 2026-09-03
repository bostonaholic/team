# Delegated publishers

Load only when repository instructions or manager markers prohibit direct git
push.

- Explicit repository/user instructions win.
- Graphite (`.graphite_repo_config`): use the required `gt submit` form; after
  rebase, `gt restack` children before publishing a stack.
- Sapling (`.sl`): use the repository's documented submit command.
- Arcanist (`.arcconfig`): use the documented arc workflow.
- Gerrit or another wrapper: use only the command named by repository
  instructions. A marker alone cannot invent flags.

Before delegation, compare `ls-remote` to the recorded pre-fetch SHA. Report
that this check has a residual race because the wrapper cannot accept git's
exact lease. Capture and compare draft state around the publisher. Never fall
back to `git push` when instructions forbid it.
