# Applying a reflection plan

Use only after the user approves entries from the printed plan.

Target selection:

- In a plugin root (`.claude-plugin/plugin.json` or root `plugin.json`), an
  existing runtime skill lives under `skills/`.
- Otherwise an existing project skill lives under `.claude/skills/`.
- If both roots contain the name, the plan names both and identifies the
  host-loaded target; do not edit the shadowed copy.
- A new skill is created only under `.claude/skills/` and only if absent.

Follow the first available authoring guide: project
`.claude/skills/create-team-skill`, another project `create-*skill*` skill,
then installed `skill-creator`. With none, use frontmatter `name` and
`description`; add both `argument-hint` and `effort` for a user-invocable
skill, otherwise `user-invocable: false` and no `effort`.

For each edit, report `git restore -- <path>` as recovery. For a file this run
created, recovery is deletion of that exact path. Never execute recovery
automatically after a failed check.
