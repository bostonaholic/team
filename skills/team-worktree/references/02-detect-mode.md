## Detect mode

If `$ARGUMENTS/4-repos.md` exists, you are in **multi-repo mode**: parse the
home repo path and each additional repo's `path:` and `name:` fields (schema:
[feature playbook](../team/playbooks/feature.md)). Otherwise you are in
**single-repo mode**: only the home repo (the one this command is running in)
gets a worktree.
