# What the migration changes

Team v0.147.0 stopped shipping 18 skills; they moved to `bostonaholic/skills`
under the names in the README's "Skills that moved" table, which the scripts
read as the moved-skill set. An older machine can lose those skills, show
each twice, or keep registrations that fail to load. The script headers own
usage, output, and exit codes.

## Target state

| Harness | Team | The moved skills |
| --- | --- | --- |
| Claude Code, Codex | `team@team-dev` from GitHub `bostonaholic/team` | `bostonaholic@skills` from GitHub `bostonaholic/skills` |
| Antigravity | `agy plugin install` of the release clone | copies in `~/.gemini/antigravity-cli/skills` |
| OpenCode | the release clone's `script/dev-install-opencode` link | copies in `$XDG_CONFIG_HOME/opencode/skills` |
| Cursor | the release clone's `script/dev-install-cursor` copy | copies in `~/.cursor/skills` |

The release clone is a clean, shallow clone of Team's latest release tag at
`${XDG_DATA_HOME:-~/.local/share}/team-migrate/team`, owned by the skill and
never the user's development checkout. OpenCode serves it live, so keep it.

`copy-collection.sh` copies the collection's skills at its latest release tag
into each directory harness's own global skill directory, never into
`~/.agents/skills`: Codex also reads that directory, so a copy there shows
twice in Codex. That is why it does not run `npx skills add`. An existing
copy stays; the scripts never update the user's copies.

## Step order

A run that stops after any step leaves every moved skill reachable:

1. Clone or update the release clone.
2. Install the collection, so every new name exists before an old one goes.
3. Remove stale registrations: any `*@bostonaholic` plugin and the
   `bostonaholic` marketplace (the pre-v0.5.0 collection).
4. Retire old copies.
5. Clear what a full dev uninstall refuses to touch: a native Antigravity copy
   (`agy plugin uninstall team`) and an OpenCode link the release clone owns.
6. Run a full `script/dev-uninstall` from each checkout that installed Team.
   Only the full form removes the clone-local `post-merge` and `post-rewrite`
   hooks that re-run the dev install. It also removes Team from Claude Code
   and Codex whatever their source, so it runs before step 7. An Antigravity
   link or Cursor copy whose checkout is gone, or too old to ship that
   harness's uninstall, goes through the release clone's
   `script/dev-uninstall-<harness>`.
7. Install or update Team natively in every harness.

Each step checks before acting, so a second run plans nothing.

## Old copies

The scripts scan `~/.agents/skills`, `$CODEX_HOME/skills`,
`$CLAUDE_CONFIG_DIR/skills`, each directory harness's skill directory, and
other `skills` directories one or two levels under a dot directory in `HOME`
or XDG config, outside any git work tree. An entry, dangling symlinks
included, moves to `<dir>-retired/<name>` when it is:

- an old name from the moved-skill table, or one of Team's own skills;
- a collection skill in a shared directory a harness on the machine reads
  (`~/.claude/skills`: Claude Code, Cursor, OpenCode; `$CODEX_HOME/skills`:
  Codex, Cursor; `~/.agents/skills`: Codex, Antigravity, OpenCode, Cursor),
  where it doubles the plugin or the harness's own copy;
- a collection skill held as a link or file, not a copy, in a directory
  harness's own directory.

An existing `<dir>-retired/<name>` blocks the plan. An agent outside the
five harnesses that read a retired copy from `~/.agents/skills` loses it;
copy that skill into the agent's own skill directory.

## Blockers

The plan refuses to run while any of these holds; each blocker line names
its remedy.

- A Claude Code, Codex, or OpenCode dev install points at a checkout that is
  gone or has no `script/dev-uninstall` (an Antigravity link or Cursor copy
  follows step 6 instead).
- `codex plugin marketplace list` fails, usually because a marketplace root
  was deleted.
- A `team-dev` or `skills` marketplace comes from another source.
- The release clone directory exists but is not a clean clone of Team.
- `~/.cursor/plugins/local/team` was not made by Team's install.
- A retired copy already exists, or `agy` is missing where needed.

## Left on disk

`verify.sh` prints a `left` line for each `-retired` directory, dangling
link, npx skills lock entry for a retired name (`npx skills update -g` would
restore it to `~/.agents/skills`), the release clone, and the copy of this
skill apply ran from. `dev-checkouts` lists the checkouts it uninstalled, so
a later run finds their hooks if a developer reinstalls.
