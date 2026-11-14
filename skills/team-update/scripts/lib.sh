# shellcheck shell=bash
# Shared paths, read-only state readers, plan steps, and the plan runner for
# update.sh, which sources this file; it changes nothing on its own.
#
# update.sh fills:
#   STEPS      one record per step, in run order: <harness>, <action>, <arg>,
#              <arg2>, and the gap the step closes, split by SEP
#   BLOCKS     one line per condition that stops the plan from running
#   SESSIONS   other running agent sessions, one per line
# Runs under macOS /bin/bash 3.2: no associative arrays, no mapfile.

LIB_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LISTING="$LIB_DIR/listing.mjs"

TEAM_SOURCE="bostonaholic/team"
TEAM_URL="https://github.com/bostonaholic/team.git"
TEAM_MARKETPLACE="team-dev"
TEAM_ID="team@team-dev"

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}"
# Existing OpenCode links and Cursor copies from a release point into this
# clone, so its path stays fixed.
RELEASE_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/team-migrate"
RELEASE_DIR="$RELEASE_HOME/team"
AGY_TEAM="$HOME/.gemini/config/plugins/team"
OPENCODE_TEAM="${OPENCODE_CONFIG_DIR:-$CONFIG_DIR/opencode}/plugins/team.js"
CURSOR_TEAM="$HOME/.cursor/plugins/local/team"
CURSOR_MARKER=".team-dev-install"

# The ASCII unit separator splits records. A tab would not: `read` collapses
# a run of IFS whitespace, so an empty field would shift the rest.
SEP="$(printf '\037')"
NL='
'

die() {
  printf '%s: %s\n' "$TOOL" "$1" >&2
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
plugin_version() { node "$LISTING" plugin-version < "$1" 2>/dev/null; }

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

# --- Host listings -------------------------------------------------------------

# Whether an installed version is at least the release's. A GitHub marketplace
# serves the default branch, which can be ahead of the last tag.
version_current() {  # <installed> <release version>
  local installed="${1%%+*}"
  [ -n "$installed" ] || return 1
  [ "$(printf '%s\n%s\n' "$installed" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1)" = "$installed" ]
}

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
  err="$(mktemp "${TMPDIR:-/tmp}/team-update.XXXXXX")"
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

plan_team() {
  local source version marker
  if in_list claude "$HARNESSES"; then
    source="$(field "$CLAUDE_MARKETS" "$TEAM_MARKETPLACE" 2)/$(field "$CLAUDE_MARKETS" "$TEAM_MARKETPLACE" 3)"
    version="$(user_version "$CLAUDE_PLUGINS" "$TEAM_ID")"
    if [ "$source" = / ]; then
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
    if [ -z "$(field "$CODEX_MARKETS" "$TEAM_MARKETPLACE" 1)" ]; then
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
    elif [ ! -d "$AGY_TEAM" ] || [ -L "$AGY_TEAM" ] ||
      [ "$(plugin_version "$AGY_TEAM/plugin.json")" != "$TEAM_VERSION" ]; then
      step antigravity agy-install "$RELEASE_DIR" "" "Team is not installed from the release clone"
    fi
  fi
  if in_list opencode "$DIR_HARNESSES"; then
    if [ ! -L "$OPENCODE_TEAM" ] ||
      ! same_dir "$(dirname "$(dirname "$(readlink "$OPENCODE_TEAM")")")" "$RELEASE_DIR"; then
      step opencode release-install opencode "" "Team is not installed from the release clone"
    fi
  fi
  if in_list cursor "$DIR_HARNESSES"; then
    marker=""
    if [ -f "$CURSOR_TEAM/$CURSOR_MARKER" ]; then marker="$(cat "$CURSOR_TEAM/$CURSOR_MARKER")"; fi
    if present "$CURSOR_TEAM" && { [ -L "$CURSOR_TEAM" ] || [ -z "$marker" ]; }; then
      block "cursor: $CURSOR_TEAM was not made by Team's install; move it aside, then run again"
    elif [ "${RELEASE_MOVES:-}" = true ] || ! same_dir "$marker" "$RELEASE_DIR" ||
      [ "$(plugin_version "$CURSOR_TEAM/.cursor-plugin/plugin.json")" != "$TEAM_VERSION" ]; then
      step cursor release-install cursor "" "Team is not installed from the release clone"
    fi
  fi
}

# Other agent processes keep what they loaded until restarted. This process's
# own ancestors, the session running the update, are not listed.
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

# --- Running a plan ------------------------------------------------------------

# The sourcing script sets TOOL (its name, for messages) first. It fills STEPS,
# BLOCKS, and optionally LEFT (lines for what the plan leaves alone), then
# calls parse_command and run_command. It defines plan_header (the lines above
# the steps) and done_message.

usage() {
  printf 'usage: %s plan | %s apply <plan-id>\n' "$0" "$0" >&2
  exit 2
}

# Checks the command line: `plan`, or `apply` with a 40-hex plan id.
parse_command() {
  case "${1:-}" in
    plan) [ "$#" -eq 1 ] || usage ;;
    apply)
      [ "$#" -eq 2 ] || usage
      case "$2" in *[!0-9a-f]* | "") usage ;; esac
      [ "${#2}" -eq 40 ] || usage
      ;;
    *) usage ;;
  esac
}

# Runs the planned command. Outside any repository, so the id is always
# SHA-1's 40 hex.
run_command() {  # <plan | apply> [<plan-id>]
  PLAN_ID="$(printf '%s' "$STEPS" | (cd / && git hash-object --stdin))"
  case "$1" in
    plan)
      render_plan
      [ -z "$BLOCKS" ] || exit 4
      ;;
    apply) apply_plan "$2" ;;
  esac
}

RUN_MODE=run

# Every command goes through here, so the plan shows exactly what apply runs.
run() {
  if [ "$RUN_MODE" = show ] || [ "${DRY_RUN:-}" = true ]; then
    if [ "$RUN_MODE" = show ]; then printf '     $'; else printf '  [dry run]'; fi
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

run_step() {  # <action> <arg> <arg2>
  case "$1" in
    release-clone)
      run mkdir -p "$RELEASE_HOME" &&
        run git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$2" "$TEAM_URL" "$RELEASE_DIR" ;;
    release-update)
      run git -C "$RELEASE_DIR" fetch --quiet --depth 1 origin tag "$2" &&
        run git -C "$RELEASE_DIR" -c advice.detachedHead=false checkout --quiet --detach "$2" ;;
    claude-marketplace-add) run claude plugin marketplace add "$2" ;;
    claude-marketplace-update) run claude plugin marketplace update "$2" ;;
    claude-install) run claude plugin install "$2" --scope user ;;
    claude-update) run claude plugin update "$2" --scope user ;;
    codex-marketplace-add) run codex plugin marketplace add "$2" ;;
    codex-marketplace-upgrade) run codex plugin marketplace upgrade "$2" ;;
    codex-add) run codex plugin add "$2" ;;
    agy-install)
      # agy writes through a link at its target, into the checkout it names.
      if [ "$RUN_MODE" = run ] && [ "${DRY_RUN:-}" != true ] && [ -L "$AGY_TEAM" ]; then
        echo "$TOOL: $AGY_TEAM is still a link; refusing to install through it" >&2
        return 1
      fi
      run agy plugin install "$2" ;;
    release-install) run "$RELEASE_DIR/script/dev-install-$2" ;;
    *) die "unknown step action: $1" ;;
  esac
}

render_plan() {
  local n=0 harness action arg arg2 gap labels="" touched="" line
  plan_header
  if [ -z "$STEPS" ] && [ -z "$BLOCKS" ]; then
    echo "Nothing to do."
  fi
  if [ -n "$STEPS" ]; then
    labels=" $(printf '%s' "$STEPS" | cut -d "$SEP" -f1 | tr '\n' ' ')"
    for line in claude codex antigravity opencode cursor; do
      if in_list "$line" "$labels"; then touched="$touched $line"; fi
    done
    echo "  Touched by this plan:$touched"
    echo "Steps, in order:"
    RUN_MODE=show
    while IFS="$SEP" read -r harness action arg arg2 gap; do
      [ -n "$action" ] || continue
      n=$((n + 1))
      printf '  %d. [%s] gap: %s\n' "$n" "$harness" "$gap"
      run_step "$action" "$arg" "$arg2"
    done <<< "$STEPS"
    RUN_MODE=run
  fi
  if [ -n "$BLOCKS" ]; then
    echo "Blocked; nothing runs until each is resolved:"
    while IFS= read -r line; do
      [ -z "$line" ] || printf '  - %s\n' "$line"
    done <<< "$BLOCKS"
  fi
  if [ -n "$LEFT" ]; then
    echo "Left as they are:"
    while IFS= read -r line; do
      [ -z "$line" ] || printf '  - %s\n' "$line"
    done <<< "$LEFT"
  fi
  if [ -n "$SESSIONS" ]; then
    echo "Other agent sessions are running. Each keeps what it loaded until restarted:"
    while IFS= read -r line; do printf '  - %s\n' "$line"; done <<< "$SESSIONS"
  fi
  echo "Plan id: $PLAN_ID"
}

apply_plan() {
  local total n=0 harness action arg arg2 gap rest
  if [ "$1" != "$PLAN_ID" ]; then
    echo "$TOOL: the plan changed since it was confirmed (now $PLAN_ID); nothing ran" >&2
    exit 3
  fi
  if [ -n "$BLOCKS" ]; then
    printf '%s: blocked; nothing ran:\n%s' "$TOOL" "$BLOCKS" >&2
    exit 4
  fi
  if [ -z "$STEPS" ]; then
    echo "Nothing to do."
    return 0
  fi
  total="$(printf '%s' "$STEPS" | grep -c .)"
  while IFS="$SEP" read -r harness action arg arg2 gap; do
    [ -n "$action" ] || continue
    n=$((n + 1))
    printf '[%d/%d] [%s] %s\n' "$n" "$total" "$harness" "$gap"
    if ! run_step "$action" "$arg" "$arg2"; then
      printf '%s: step %d failed: [%s] %s\n' "$TOOL" "$n" "$harness" "$gap" >&2
      rest="$(printf '%s' "$STEPS" | awk -F "$SEP" -v from="$((n + 1))" 'NR >= from { printf "  not run: [%s] %s\n", $1, $5 }')"
      [ -z "$rest" ] || printf '%s\n' "$rest" >&2
      exit 1
    fi
  done <<< "$STEPS"
  done_message
}
