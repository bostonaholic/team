## Detect mode

If `$ARGUMENTS/4-repos.md` exists: **multi-repo mode** — parse the home repo
path and each repo's `path:` and `name:` fields (schema:
[conditional artifacts](../../team/references/conditional-artifacts.md)). Otherwise **single-repo
mode**: only the home repo (where this command runs) gets a worktree.
