## Detect mode

1. Use the directory resolved in `## Input`.
2. **Read `$ARGUMENTS/4-repos.md`** if present:
   - Parse the home repo path and the list of more repos (each with `path:`
     and `name:` fields). See `skills/qrspi-workflow/SKILL.md` for the
     schema.
   - This puts you in **multi-repo mode**.
3. If `4-repos.md` is absent, you are in **single-repo mode**: only the
   home repo (the one this command is running in) gets a worktree.
