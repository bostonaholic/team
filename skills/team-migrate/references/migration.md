# What the migration changes

Team v0.147.0 stopped shipping 18 skills, and a later release dropped
`principle-fix-root-causes`. They moved to `bostonaholic/skills`
under the names in the README's "Skills that moved" table, which the scripts
read as the moved-skill set. A machine set up before then can lose those
skills, show each one twice, or keep registrations that fail to load. The
script headers own usage, output, and exit codes.

## Target state

| Harness | Team | The moved skills |
| --- | --- | --- |
| Claude Code | `team@team-dev` from GitHub `bostonaholic/team` | `bostonaholic@skills` from GitHub `bostonaholic/skills` |
| Codex | `team@team-dev` from GitHub `bostonaholic/team` | `bostonaholic@skills` from GitHub `bostonaholic/skills` |
| Antigravity | `agy plugin install` of the release clone | copies in `~/.gemini/antigravity-cli/skills` |
| OpenCode | the release clone's `script/dev-install-opencode` link | copies in `$XDG_CONFIG_HOME/opencode/skills` |
| Cursor | the release clone's `script/dev-install-cursor` copy | copies in `~/.cursor/skills` |

The release clone is a clean, shallow clone of Team's latest release tag at
`${XDG_DATA_HOME:-~/.local/share}/team-migrate/team`. The skill owns it; it is
never the user's development checkout. OpenCode serves it live, so keep it.

`copy-collection.sh` copies every skill the collection's plugin manifest lists
at its latest release tag into each directory harness's own global skill
directory, the one npx skills names for that agent. It does not run `npx
skills add`: npx skills 1.7.0 treats Antigravity CLI, OpenCode, and Cursor as
universal agents and puts their global skills in `~/.agents/skills`, which
Codex also reads, so every collection skill would show twice in Codex. A copy
already in place stays; the scripts never update the user's copies.

## Step order

A run that stops after any step leaves every moved skill reachable:

1. Clone or update the release clone.
2. Install the collection, so every new name exists before an old one goes.
3. Remove stale registrations: any `*@bostonaholic` plugin and the
   `bostonaholic` marketplace, the pre-v0.5.0 collection.
4. Retire old copies.
5. Clear what a full dev uninstall refuses to touch: a native Antigravity copy
   (`agy plugin uninstall team`) and an OpenCode link the release clone owns.
6. Run a full `script/dev-uninstall` from each checkout that installed Team.
   Only the full form removes the clone-local `post-merge` and `post-rewrite`
   hooks that re-run the dev install on every pull and rebase. It also removes
   Team from Claude Code and Codex whatever their source, so it runs before
   Team's native install, never after. An Antigravity link or Cursor copy whose
   checkout is gone, or too old to ship that harness's uninstall, goes through
   the release clone's `script/dev-uninstall-<harness>`.
7. Install or update Team natively in every harness.

Each step checks before it acts, so a second run plans nothing.

## Old copies

The scripts look in `~/.agents/skills`, `$CODEX_HOME/skills`,
`$CLAUDE_CONFIG_DIR/skills`, each directory harness's skill directory, and
every other `skills` directory one or two levels under a dot directory in
`HOME` or under XDG config, skipping any inside a git work tree. A dangling
symlink counts. An entry moves to `<dir>-retired/<name>` when its name is:

- an old name from the moved-skill table, in any of those directories;
- one of Team's own skills, in any of them, since Team arrives as a plugin;
- a collection skill, in a shared directory a harness on the machine reads:
  `~/.claude/skills` (Claude Code, Cursor, OpenCode), `$CODEX_HOME/skills`
  (Codex, Cursor), or `~/.agents/skills` (Codex, Antigravity, OpenCode,
  Cursor). There it doubles the plugin or the harness's own copy;
- a collection skill whose place in a directory harness's own directory holds
  a link or file instead of a copy.

An existing `<dir>-retired/<name>` blocks the plan. The scripts never
overwrite it. An agent outside the five harnesses that read a retired copy
from `~/.agents/skills` loses it; copy that skill into the agent's own skill
directory.

## Blockers

The plan refuses to run, and changes nothing, while any of these holds. Each
blocker line names its remedy.

- A Claude Code, Codex, or OpenCode dev install points at a checkout that is
  gone or has no `script/dev-uninstall`. An Antigravity link or Cursor copy in
  that state goes through the release clone's own uninstall instead.
- `codex plugin marketplace list` fails, usually because a marketplace root
  was deleted.
- A `team-dev` or `skills` marketplace comes from another source.
- The release clone directory exists but is not a clean clone of Team.
- `~/.cursor/plugins/local/team` was not made by Team's install.
- A retired copy already exists, or `agy` is missing where needed.

## Left on disk

`verify.sh` prints a `left` line for each `-retired` directory, each dangling
link it finds, each npx skills lock entry for a retired name (`npx skills
update -g` would put that skill back in `~/.agents/skills`), the release
clone, and the copy of this skill apply ran from. The skill's directory also
keeps `dev-checkouts`, the checkouts it uninstalled, so a later run finds
their hooks if a developer installs again.
