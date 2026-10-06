# shellcheck shell=bash
# Shared paths and read-only state readers for team-migrate. Sourced by
# migrate.sh and verify.sh; it changes nothing on its own.
#
# compute_plan reads every harness on the machine and fills:
#   STEPS      one record per step, in run order: <harness>, <action>, <arg>,
#              <arg2>, and the gap the step closes, split by SEP
#   BLOCKS     one line per condition that stops the plan from running
#   HARNESSES  the harnesses on this machine, space-separated
#   SESSIONS   other running agent sessions, one per line
# Runs under macOS /bin/bash 3.2: no associative arrays, no mapfile.

LIB_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd -P "$LIB_DIR/../../.." && pwd)"
README="$PLUGIN_ROOT/README.md"
LISTING="$LIB_DIR/listing.mjs"

TEAM_SOURCE="bostonaholic/team"
TEAM_URL="https://github.com/bostonaholic/team.git"
TEAM_MARKETPLACE="team-dev"
TEAM_ID="team@team-dev"
SKILLS_SOURCE="bostonaholic/skills"
SKILLS_URL="https://github.com/bostonaholic/skills.git"
SKILLS_MARKETPLACE="skills"
SKILLS_ID="bostonaholic@skills"
STALE_MARKETPLACE="bostonaholic"
HOOK_MARKER="# Managed by Team dev install."

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}"
MIGRATE_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/team-migrate"
RELEASE_DIR="$MIGRATE_HOME/team"
CHECKOUTS_FILE="$MIGRATE_HOME/dev-checkouts"
# shellcheck disable=SC2034  # the copy apply runs from; read by migrate.sh and verify.sh
RUN_ROOT="$MIGRATE_HOME/run"
AGY_TEAM="$HOME/.gemini/config/plugins/team"
OPENCODE_TEAM="${OPENCODE_CONFIG_DIR:-$CONFIG_DIR/opencode}/plugins/team.js"
CURSOR_TEAM="$HOME/.cursor/plugins/local/team"
CURSOR_MARKER=".team-dev-install"
DIR_HARNESS_SET="antigravity opencode cursor"

# The ASCII unit separator splits records. A tab would not: `read` collapses
# a run of IFS whitespace, so an empty field would shift the rest.
SEP="$(printf '\037')"
NL='
'

die() {
  printf 'team-migrate: %s\n' "$1" >&2
  exit 1
}

present() { [ -e "$1" ] || [ -L "$1" ]; }
has() { command -v "$1" >/dev/null 2>&1; }
in_list() { case " $2 " in *" $1 "*) return 0 ;; esac; return 1; }
real_dir() { (cd -P -- "$1" 2>/dev/null && pwd -P); }
same_dir() {
  local a b
  a="$(real_dir "$1")" b="$(real_dir "$2")"
  [ -n "$a" ] && [ "$a" = "$b" ]
}
is_team_checkout() { [ -x "$1/script/dev-uninstall" ]; }
plugin_version() { node "$LISTING" plugin-version < "$1" 2>/dev/null; }

# The global skill directory of each harness that installs only from a
# directory, as npx skills names it for that agent.
npx_dir() {
  case "$1" in
    antigravity) echo "$HOME/.gemini/antigravity-cli/skills" ;;
    opencode) echo "$CONFIG_DIR/opencode/skills" ;;
    cursor) echo "$HOME/.cursor/skills" ;;
  esac
}

harnesses() {
  local list=""
  has claude && list="$list claude"
  has codex && list="$list codex"
  { has agy || present "$AGY_TEAM"; } && list="$list antigravity"
  # Its config directory outlives a removed install, as npx skills detects it.
  { has opencode || [ -d "$(dirname "$(dirname "$OPENCODE_TEAM")")" ]; } && list="$list opencode"
  { has cursor || [ -d "$HOME/.cursor" ]; } && list="$list cursor"
  printf '%s\n' "${list# }"
}

# --- Skill names ---------------------------------------------------------------

# Old names come from the README's "Skills that moved" table, the one source
# of the moved-skill set. Team's names come from its own skills/.
load_names() {
  local moved dir
  [ -f "$README" ] || die "no README at $README; it holds the moved-skill table"
  moved="$(awk '
    /^## / { inside = ($0 == "## Skills that moved"); next }
    inside && /^\| `\/[a-z0-9-]+` \| `\/[a-z0-9-]+` \|$/ {
      split($0, cell, "`")
      printf "%s\t%s\n", substr(cell[2], 2), substr(cell[4], 2)
    }
  ' "$README")"
  [ -n "$moved" ] || die "the Skills that moved table in $README has no rows"
  OLD_NAMES="$(printf '%s\n' "$moved" | cut -f1 | tr '\n' ' ')"
  TEAM_NAMES=""
  for dir in "$PLUGIN_ROOT"/skills/*/; do
    [ -f "${dir}SKILL.md" ] && TEAM_NAMES="$TEAM_NAMES $(basename "$dir")"
  done
  [ -n "$TEAM_NAMES" ] || die "no skills under $PLUGIN_ROOT/skills"
}

# Every directory an agent loads bare skills from: the plugin hosts' own, the
# directory harnesses', and any other `skills` one or two levels under a dot
# directory in HOME or under XDG config. A directory inside a git work tree is
# a source checkout, not an agent's, and is skipped.
skill_dirs() {
  local dir
  for dir in "$HOME/.agents/skills" "$CODEX_DIR/skills" "$CLAUDE_DIR/skills" \
    "$(npx_dir antigravity)" "$(npx_dir opencode)" "$(npx_dir cursor)" \
    "$HOME"/.[!.]*/skills "$HOME"/.[!.]*/*/skills "$CONFIG_DIR"/*/skills "$CONFIG_DIR"/*/*/skills; do
    [ -d "$dir" ] || continue
    case "$dir" in "$HOME/.Trash/"*) continue ;; esac
    if [ "$dir" != "$HOME/.agents/skills" ] && [ "$dir" != "$CODEX_DIR/skills" ] && [ "$dir" != "$CLAUDE_DIR/skills" ] &&
      [ "$(git -C "$dir" rev-parse --is-inside-work-tree 2>/dev/null)" = true ]; then
      continue
    fi
    printf '%s\n' "$dir"
  done | awk '!seen[$0]++'
}

# The harnesses on this machine that read a skill directory. Cursor and
# OpenCode also read the shared ones for compatibility, so a bare collection
# copy there doubles the plugin or the harness's own copy.
dir_readers() {
  local readers="" harness
  case "$1" in
    "$CLAUDE_DIR/skills") readers="claude cursor opencode" ;;
    "$CODEX_DIR/skills") readers="codex cursor" ;;
    "$HOME/.agents/skills") readers="codex antigravity opencode cursor" ;;
    "$(npx_dir antigravity)") readers=antigravity ;;
    "$(npx_dir opencode)") readers=opencode ;;
    "$(npx_dir cursor)") readers=cursor ;;
  esac
  for harness in $readers; do
    if in_list "$harness" "$HARNESSES"; then printf '%s ' "$harness"; fi
  done
}
shared_dir() {
  case "$1" in "$CLAUDE_DIR/skills" | "$CODEX_DIR/skills" | "$HOME/.agents/skills") [ -n "$(dir_readers "$1")" ] ;; *) return 1 ;; esac
}

# --- Host listings -------------------------------------------------------------

# The collection's skills, as the paths its plugin manifest lists at the
# latest release, fetched into a temporary repository.
read_collection() {
  local tmp
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/team-migrate.XXXXXX")"
  COLL_PATHS="$(git -C "$tmp" init --quiet --bare &&
    git -C "$tmp" fetch --quiet --depth 1 "$SKILLS_URL" "refs/tags/$SKILLS_TAG" &&
    git -C "$tmp" show "FETCH_HEAD:.claude-plugin/plugin.json" | node "$LISTING" collection-skills)" || COLL_PATHS=""
  rm -rf "${tmp:?}"
  [ -n "$COLL_PATHS" ] || die "cannot read the collection's skill list at $SKILLS_TAG from $SKILLS_URL"
  COLL_NAMES="$(printf '%s\n' "$COLL_PATHS" | sed 's#.*/##' | tr '\n' ' ')"
}

# Whether an installed version is at least the release's. A GitHub marketplace
# serves the default branch, which can be ahead of the last tag.
version_current() {  # <installed> <release version>
  local installed="${1%%+*}"
  [ -n "$installed" ] || return 1
  [ "$(printf '%s\n%s\n' "$installed" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1)" = "$installed" ]
}

# A collection skill a directory harness holds as its own complete copy.
skill_copied() { [ -d "$1/$2" ] && [ ! -L "$1/$2" ] && [ -f "$1/$2/SKILL.md" ]; }

latest_tag() {
  git ls-remote --tags --refs "$1" 'v*' 2>/dev/null |
    sed -n 's#^[0-9a-f]*[[:space:]]*refs/tags/\(v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)$#\1#p' |
    sort -t. -k1.2,1n -k2,2n -k3,3n | tail -n 1
}

read_claude() {
  CLAUDE_MARKETS="$(claude plugin marketplace list --json | node "$LISTING" claude-marketplaces)" ||
    die "cannot read 'claude plugin marketplace list --json'"
  CLAUDE_PLUGINS="$(claude plugin list --json | node "$LISTING" claude-plugins)" ||
    die "cannot read 'claude plugin list --json'"
}

# Codex lists nothing while any marketplace root lacks a manifest, so a failed
# read blocks the plan and names Codex's own message.
read_codex() {
  local err
  CODEX_OK=false CODEX_MARKETS="" CODEX_PLUGINS=""
  err="$(mktemp "${TMPDIR:-/tmp}/team-migrate.XXXXXX")"
  if CODEX_MARKETS="$(codex plugin marketplace list --json 2>"$err" | node "$LISTING" codex-marketplaces)" &&
    CODEX_PLUGINS="$(codex plugin list --json 2>"$err" | node "$LISTING" codex-plugins)"; then
    CODEX_OK=true
  else
    block "codex: cannot list plugins: $(tr '\n' ' ' < "$err")— if a marketplace root above is gone, run: codex plugin marketplace remove <name>"
  fi
  rm -f "$err"
}

# field <records> <key> <n>: field n of the first record keyed by key.
field() { printf '%s\n' "$1" | awk -F "$SEP" -v key="$2" -v n="$3" '$1 == key { print $n; exit }'; }
user_version() { printf '%s\n' "$1" | awk -F "$SEP" -v id="$2" '$1 == id && $2 == "user" { print $3; exit }'; }
github_url() { [ "$1" = "https://github.com/$2.git" ] || [ "$1" = "https://github.com/$2" ]; }

# --- Plan building -------------------------------------------------------------

step() { STEPS="$STEPS$1$SEP$2$SEP$3$SEP$4$SEP$5$NL"; }
block() { BLOCKS="$BLOCKS$1$NL"; }

# A path from host config goes into a record only when it is absolute and
# cannot break one.
safe_path() {
  case "$1" in
    /*"$SEP"* | /*"$NL"* | /*/../* | /*/.. | /../* ) ;;
    /*) return 0 ;;
  esac
  block "unusable path in host config: $(printf '%q' "$1")"
  return 1
}

add_checkout() {  # <path> <harness that points at it>
  local dir
  safe_path "$1" || return 0
  if ! is_team_checkout "$1"; then
    block "$2: Team's dev install points at $1, which has no script/dev-uninstall. Restore that checkout, or remove the install by hand: $(orphan_hint "$2")"
    return 0
  fi
  dir="$(real_dir "$1")"
  case "$NL$DEV_CHECKOUTS" in *"$NL$dir$NL"*) return 0 ;; esac
  DEV_CHECKOUTS="$DEV_CHECKOUTS$dir$NL"
}

orphan_hint() {
  case "$1" in
    claude) echo "claude plugin uninstall $TEAM_ID; claude plugin marketplace remove $TEAM_MARKETPLACE" ;;
    codex) echo "codex plugin remove $TEAM_ID; codex plugin marketplace remove $TEAM_MARKETPLACE" ;;
    opencode) echo "move the link $OPENCODE_TEAM aside" ;;
  esac
}

has_hooks() { is_team_checkout "$1" && [ -n "$(team_hooks "$1")" ]; }

team_hooks() {
  local common hook
  common="$(git -C "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 0
  for hook in post-merge post-rewrite; do
    if [ -f "$common/hooks/$hook" ] && [ ! -L "$common/hooks/$hook" ] &&
      grep -qxF "$HOOK_MARKER" "$common/hooks/$hook"; then
      printf '%s\n' "$common/hooks/$hook"
    fi
  done
}

# Every checkout a local-source install or reinstall hook points at. The
# release clone this skill owns is the target state, not a dev install.
find_dev_checkouts() {
  local owner path
  DEV_CHECKOUTS=""
  # OpenCode refuses to unlink another checkout's link, so its owner goes first.
  # Its uninstall also compares the link with the checkout's real path.
  if [ -L "$OPENCODE_TEAM" ]; then
    path="$(readlink "$OPENCODE_TEAM")"
    owner="$(dirname "$(dirname "$path")")"
    if same_dir "$owner" "$RELEASE_DIR"; then
      :
    elif is_team_checkout "$owner" && [ "$path" != "$(real_dir "$owner")/opencode/team.js" ]; then
      block "opencode: $OPENCODE_TEAM reaches its checkout through another path, so the dev uninstall would refuse it; move the link aside, then run again"
    else
      add_checkout "$owner" opencode
    fi
  fi
  if in_list claude "$HARNESSES" && [ "$(field "$CLAUDE_MARKETS" "$TEAM_MARKETPLACE" 2)" = directory ]; then
    add_checkout "$(field "$CLAUDE_MARKETS" "$TEAM_MARKETPLACE" 3)" claude
  fi
  if [ "${CODEX_OK:-}" = true ] && [ "$(field "$CODEX_MARKETS" "$TEAM_MARKETPLACE" 2)" = local ]; then
    add_checkout "$(field "$CODEX_MARKETS" "$TEAM_MARKETPLACE" 4)" codex
  fi
  # A checkout too old to remove its own Antigravity link or Cursor copy, or
  # one that is gone, leaves it to the release clone's uninstall.
  if [ -L "$AGY_TEAM" ]; then
    path="$(readlink "$AGY_TEAM")"
    if [ -x "$path/script/dev-uninstall-antigravity" ] || has_hooks "$path"; then add_checkout "$path" antigravity; fi
  fi
  if [ -f "$CURSOR_TEAM/$CURSOR_MARKER" ] && [ ! -L "$CURSOR_TEAM" ]; then
    path="$(cat "$CURSOR_TEAM/$CURSOR_MARKER")"
    if ! same_dir "$path" "$RELEASE_DIR" && { [ -x "$path/script/dev-uninstall-cursor" ] || has_hooks "$path"; }; then
      add_checkout "$path" cursor
    fi
  fi
  # A checkout can hold only the hooks: the invoking one, or one a past run
  # uninstalled before the developer installed again.
  while IFS= read -r path; do
    if [ -n "$path" ] && has_hooks "$path"; then add_checkout "$path" hooks; fi
  done <<< "$(git rev-parse --show-toplevel 2>/dev/null; cat "$CHECKOUTS_FILE" 2>/dev/null)"
}

plan_release() {
  local origin
  [ -n "$DIR_HARNESSES" ] || return 0
  if ! present "$RELEASE_DIR"; then
    step "$DIR_HARNESSES" release-clone "$TEAM_TAG" "" "no release source for the harnesses that install only from a directory"
    RELEASE_MOVES=true
    return 0
  fi
  origin="$(git -C "$RELEASE_DIR" config --get remote.origin.url 2>/dev/null)" || origin=""
  if [ "$origin" != "$TEAM_URL" ] || [ -n "$(git -C "$RELEASE_DIR" status --porcelain 2>/dev/null)" ]; then
    block "$RELEASE_DIR is not a clean clone of $TEAM_URL. Move it aside and run again."
    return 0
  fi
  if [ "$(git -C "$RELEASE_DIR" describe --tags --exact-match HEAD 2>/dev/null)" != "$TEAM_TAG" ]; then
    step "$DIR_HARNESSES" release-update "$TEAM_TAG" "" "the release clone is behind $TEAM_TAG"
    RELEASE_MOVES=true
  fi
}

plan_collection() {
  local source version harness dir name targets="" blocking
  if in_list claude "$HARNESSES"; then
    source="$(field "$CLAUDE_MARKETS" "$SKILLS_MARKETPLACE" 2)/$(field "$CLAUDE_MARKETS" "$SKILLS_MARKETPLACE" 3)"
    version="$(user_version "$CLAUDE_PLUGINS" "$SKILLS_ID")"
    if [ "$source" = / ]; then
      step claude claude-marketplace-add "$SKILLS_SOURCE" "" "no marketplace for the moved skills"
    elif [ "$source" != "github/$SKILLS_SOURCE" ]; then
      block "claude: the '$SKILLS_MARKETPLACE' marketplace comes from ${source#/}, not $SKILLS_SOURCE. Remove it with: claude plugin marketplace remove $SKILLS_MARKETPLACE"
    fi
    if [ -z "$version" ]; then
      step claude claude-install "$SKILLS_ID" "" "the moved skills are missing under their new names"
    elif ! version_current "$version" "$SKILLS_VERSION"; then
      step claude claude-marketplace-update "$SKILLS_MARKETPLACE" "" "the moved skills' catalog is behind $SKILLS_TAG"
      step claude claude-update "$SKILLS_ID" "" "the moved skills are behind $SKILLS_TAG"
    fi
  fi
  if [ "${CODEX_OK:-}" = true ]; then
    source="$(field "$CODEX_MARKETS" "$SKILLS_MARKETPLACE" 3)"
    version="$(field "$CODEX_PLUGINS" "$SKILLS_ID" 2)"
    if [ -z "$(field "$CODEX_MARKETS" "$SKILLS_MARKETPLACE" 1)" ]; then
      step codex codex-marketplace-add "$SKILLS_SOURCE" "" "no marketplace for the moved skills"
    elif ! github_url "$source" "$SKILLS_SOURCE"; then
      block "codex: the '$SKILLS_MARKETPLACE' marketplace comes from ${source:-a local root}, not $SKILLS_SOURCE. Remove it with: codex plugin marketplace remove $SKILLS_MARKETPLACE"
    elif [ -n "$version" ] && ! version_current "$version" "$SKILLS_VERSION"; then
      step codex codex-marketplace-upgrade "$SKILLS_MARKETPLACE" "" "the moved skills' catalog is behind $SKILLS_TAG"
    fi
    if ! version_current "$version" "$SKILLS_VERSION"; then
      step codex codex-add "$SKILLS_ID" "" "the moved skills are missing or behind $SKILLS_TAG"
    fi
  fi
  # Each directory harness gets its own copy. npx skills installs these
  # harnesses' global skills into ~/.agents/skills, which Codex also reads.
  for harness in $DIR_HARNESSES; do
    dir="$(npx_dir "$harness")"
    blocking=""
    for name in $COLL_NAMES; do
      if skill_copied "$dir" "$name"; then continue; fi
      in_list "$harness" "$targets" || targets="$targets $harness"
      if present "$dir/$name"; then blocking="$blocking $name"; fi
    done
    if [ -n "$blocking" ]; then plan_retire_names "$dir" "$blocking" "a link or partial copy stands where a copy goes:"; fi
  done
  targets="${targets# }"
  if [ -n "$targets" ]; then
    step "$targets" collection-copy "$targets" "$SKILLS_TAG" "the moved skills are missing under their new names"
  fi
}

stale_id() {
  case "$1" in
    [A-Za-z0-9]*"@$STALE_MARKETPLACE") case "${1%@*}" in *[!A-Za-z0-9._-]*) return 1 ;; esac ;;
    *) return 1 ;;
  esac
}

plan_stale() {
  local id scope rest
  if in_list claude "$HARNESSES"; then
    while IFS="$SEP" read -r id scope rest; do
      stale_id "$id" || continue
      # Another scope belongs to a project, and the CLI acts on the current one.
      if [ "$scope" = user ]; then step claude claude-uninstall "$id" user "a stale plugin fails to load"
      else block "claude: stale plugin $id is installed at $scope scope; run claude plugin uninstall $id --scope $scope from that project"; fi
    done <<< "$CLAUDE_PLUGINS"
    [ -z "$(field "$CLAUDE_MARKETS" "$STALE_MARKETPLACE" 1)" ] ||
      step claude claude-marketplace-remove "$STALE_MARKETPLACE" "" "a stale marketplace stays registered"
  fi
  if [ "${CODEX_OK:-}" = true ]; then
    while IFS="$SEP" read -r id rest; do
      if stale_id "$id"; then step codex codex-remove "$id" "" "a stale plugin fails to load"; fi
    done <<< "$CODEX_PLUGINS"
    [ -z "$(field "$CODEX_MARKETS" "$STALE_MARKETPLACE" 1)" ] ||
      step codex codex-marketplace-remove "$STALE_MARKETPLACE" "" "a stale marketplace stays registered"
  fi
}

# Old names are stale wherever they are. Team's names double the Team plugin
# every harness gets. The collection's names double its plugin only in a
# directory a plugin host reads; elsewhere they are the harness's own install.
plan_retire() {
  local dir name names found gap
  while IFS= read -r dir; do
    [ -n "$dir" ] || continue
    names="$OLD_NAMES $TEAM_NAMES" found="" gap="old-name copies show beside their new names:"
    if shared_dir "$dir"; then names="$names $COLL_NAMES"; fi
    for name in $names; do
      present "$dir/$name" || continue
      found="$found $name"
      in_list "$name" "$OLD_NAMES" || gap="copies show twice or under an old name:"
    done
    if [ -n "$found" ]; then plan_retire_names "$dir" "$found" "$gap"; fi
  done <<< "$(skill_dirs)"
}

# One step moves every named entry of a directory to its -retired sibling.
plan_retire_names() {  # <dir> <names> <gap prefix>
  local name readers clear=true
  safe_path "$1" || return 0
  if present "$1-retired" && [ ! -d "$1-retired" ]; then
    block "$1-retired exists and is not a directory"
    return 0
  fi
  for name in $2; do
    if present "$1-retired/$name"; then
      block "$1-retired/$name already exists; move $1/$name aside by hand, then run again"
      clear=false
    fi
  done
  if [ "$clear" = true ]; then
    readers="$(dir_readers "$1")"
    readers="${readers% }"
    step "${readers:-other agents}" retire "$1" "${2# }" "$3${2}"
  fi
}

# A full dev uninstall stops at the first harness it cannot undo, before it
# removes the hooks, so every install it would refuse is cleared first.
plan_dev_uninstall() {
  local dir owner
  if [ -n "$DEV_CHECKOUTS" ]; then
    if [ -d "$AGY_TEAM" ] && [ ! -L "$AGY_TEAM" ] && dev_script antigravity; then
      if has agy; then step antigravity agy-uninstall team "" "a native copy would stop the dev uninstall"
      else block "antigravity: $AGY_TEAM is a native install and agy is not on PATH to remove it"; fi
    fi
    if [ -L "$OPENCODE_TEAM" ] && dev_script opencode; then
      owner="$(dirname "$(dirname "$(readlink "$OPENCODE_TEAM")")")"
      if same_dir "$owner" "$RELEASE_DIR"; then
        step opencode release-uninstall opencode "" "the release clone's link would stop the dev uninstall"
      fi
    fi
    while IFS= read -r dir; do
      [ -n "$dir" ] || continue
      # A full dev uninstall acts on every harness, whatever installed Team there.
      step "$HARNESSES" dev-uninstall "$dir" "" "Team runs from a checkout, and its hooks reinstall it on every pull and rebase"
    done <<< "$DEV_CHECKOUTS"
    TEAM_REMOVED=true
  fi
  if [ -L "$AGY_TEAM" ] && ! dev_script antigravity; then
    step antigravity release-uninstall antigravity "" "the dev checkout cannot remove its Antigravity link"
  fi
  if [ -f "$CURSOR_TEAM/$CURSOR_MARKER" ] && [ ! -L "$CURSOR_TEAM" ] && ! dev_script cursor &&
    ! same_dir "$(cat "$CURSOR_TEAM/$CURSOR_MARKER")" "$RELEASE_DIR"; then
    step cursor release-uninstall cursor "" "the dev checkout cannot remove its Cursor copy"
  fi
}

# Whether any checkout being uninstalled ships the named harness's uninstall.
dev_script() {
  local dir
  while IFS= read -r dir; do
    if [ -n "$dir" ] && [ -x "$dir/script/dev-uninstall-$1" ]; then return 0; fi
  done <<< "$DEV_CHECKOUTS"
  return 1
}

plan_team() {
  local source version marker
  if in_list claude "$HARNESSES"; then
    source="$(field "$CLAUDE_MARKETS" "$TEAM_MARKETPLACE" 2)/$(field "$CLAUDE_MARKETS" "$TEAM_MARKETPLACE" 3)"
    version="$(user_version "$CLAUDE_PLUGINS" "$TEAM_ID")"
    if [ "$TEAM_REMOVED" = true ] || [ "$source" = / ]; then
      step claude claude-marketplace-add "$TEAM_SOURCE" "" "no GitHub marketplace for Team"
      step claude claude-install "$TEAM_ID" "" "Team is not installed from its release"
    elif [ "$source" != "github/$TEAM_SOURCE" ]; then
      [ "${source%%/*}" = directory ] ||
        block "claude: the '$TEAM_MARKETPLACE' marketplace comes from ${source#/}, not $TEAM_SOURCE. Remove it with: claude plugin marketplace remove $TEAM_MARKETPLACE"
    elif [ -z "$version" ]; then
      step claude claude-install "$TEAM_ID" "" "Team is not installed from its release"
    elif ! version_current "$version" "$TEAM_VERSION"; then
      step claude claude-marketplace-update "$TEAM_MARKETPLACE" "" "Team's catalog is behind $TEAM_TAG"
      step claude claude-update "$TEAM_ID" "" "Team is behind $TEAM_TAG"
    fi
  fi
  if [ "${CODEX_OK:-}" = true ]; then
    source="$(field "$CODEX_MARKETS" "$TEAM_MARKETPLACE" 2)"
    version="$(field "$CODEX_PLUGINS" "$TEAM_ID" 2)"
    if [ "$TEAM_REMOVED" = true ] || [ -z "$(field "$CODEX_MARKETS" "$TEAM_MARKETPLACE" 1)" ]; then
      step codex codex-marketplace-add "$TEAM_SOURCE" "" "no GitHub marketplace for Team"
      step codex codex-add "$TEAM_ID" "" "Team is not installed from its release"
    elif ! github_url "$(field "$CODEX_MARKETS" "$TEAM_MARKETPLACE" 3)" "$TEAM_SOURCE"; then
      [ "$source" = local ] ||
        block "codex: the '$TEAM_MARKETPLACE' marketplace does not come from $TEAM_SOURCE. Remove it with: codex plugin marketplace remove $TEAM_MARKETPLACE"
    elif ! version_current "$version" "$TEAM_VERSION"; then
      [ -z "$version" ] || step codex codex-marketplace-upgrade "$TEAM_MARKETPLACE" "" "Team's catalog is behind $TEAM_TAG"
      step codex codex-add "$TEAM_ID" "" "Team is missing or behind $TEAM_TAG"
    fi
  fi
  if in_list antigravity "$DIR_HARNESSES"; then
    if ! has agy; then
      block "antigravity: agy is not on PATH, so Team cannot be installed from the release clone"
    elif [ "$TEAM_REMOVED" = true ] || [ ! -d "$AGY_TEAM" ] || [ -L "$AGY_TEAM" ] ||
      [ "$(plugin_version "$AGY_TEAM/plugin.json")" != "$TEAM_VERSION" ]; then
      step antigravity agy-install "$RELEASE_DIR" "" "Team is not installed from the release clone"
    fi
  fi
  if in_list opencode "$DIR_HARNESSES"; then
    if [ "$TEAM_REMOVED" = true ] || [ ! -L "$OPENCODE_TEAM" ] ||
      ! same_dir "$(dirname "$(dirname "$(readlink "$OPENCODE_TEAM")")")" "$RELEASE_DIR"; then
      step opencode release-install opencode "" "Team is not installed from the release clone"
    fi
  fi
  if in_list cursor "$DIR_HARNESSES"; then
    marker=""
    if [ -f "$CURSOR_TEAM/$CURSOR_MARKER" ]; then marker="$(cat "$CURSOR_TEAM/$CURSOR_MARKER")"; fi
    if present "$CURSOR_TEAM" && { [ -L "$CURSOR_TEAM" ] || [ -z "$marker" ]; }; then
      block "cursor: $CURSOR_TEAM was not made by Team's install; move it aside, then run again"
    elif [ "$TEAM_REMOVED" = true ] || [ "${RELEASE_MOVES:-}" = true ] || ! same_dir "$marker" "$RELEASE_DIR" ||
      [ "$(plugin_version "$CURSOR_TEAM/.cursor-plugin/plugin.json")" != "$TEAM_VERSION" ]; then
      step cursor release-install cursor "" "Team is not installed from the release clone"
    fi
  fi
}

# Other agent processes keep what they loaded until restarted. This process's
# own ancestors, the session running the migration, are not listed.
other_sessions() {
  local ancestors=" $$ " pid=$$ ppid comm
  while ppid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')" && [ -n "$ppid" ] && [ "$ppid" -gt 1 ]; do
    ancestors="$ancestors$ppid "
    pid="$ppid"
  done
  ps -axo pid=,comm= 2>/dev/null | while read -r pid comm; do
    case "${comm##*/}" in claude | codex | agy | opencode | Cursor) ;; *) continue ;; esac
    in_list "$pid" "$ancestors" || printf '%s (pid %s)\n' "${comm##*/}" "$pid"
  done
}

compute_plan() {
  local harness
  STEPS="" BLOCKS="" TEAM_REMOVED=false RELEASE_MOVES=false DIR_HARNESSES=""
  load_names
  HARNESSES="$(harnesses)"
  for harness in $HARNESSES; do
    if in_list "$harness" "$DIR_HARNESS_SET"; then DIR_HARNESSES="$DIR_HARNESSES $harness"; fi
  done
  DIR_HARNESSES="${DIR_HARNESSES# }"
  # A failed read must reach die, not stop the script silently under errexit.
  TEAM_TAG="$(latest_tag "$TEAM_URL")" || TEAM_TAG=""
  [ -n "$TEAM_TAG" ] || die "cannot read Team's release tags from $TEAM_URL"
  SKILLS_TAG="$(latest_tag "$SKILLS_URL")" || SKILLS_TAG=""
  [ -n "$SKILLS_TAG" ] || die "cannot read the collection's release tags from $SKILLS_URL"
  TEAM_VERSION="${TEAM_TAG#v}" SKILLS_VERSION="${SKILLS_TAG#v}"
  read_collection
  if in_list claude "$HARNESSES"; then read_claude; fi
  if in_list codex "$HARNESSES"; then read_codex; fi
  find_dev_checkouts
  plan_release
  plan_collection
  plan_stale
  plan_retire
  plan_dev_uninstall
  plan_team
  # shellcheck disable=SC2034  # read by the scripts that source this file
  SESSIONS="$(other_sessions)" || SESSIONS=""
}
