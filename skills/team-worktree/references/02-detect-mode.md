## Detect mode

If `$ARGUMENTS/4-repos.md` exists: **multi-repo mode** — parse the home repo
path and each repo's `path:` and `name:` fields (schema:
[feature playbook](../team/playbooks/feature.md)). Otherwise **single-repo
mode**: only the home repo (where this command runs) gets a worktree.
