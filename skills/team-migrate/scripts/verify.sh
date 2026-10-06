#!/bin/bash
#
# Verify a team-migrate run by asking every harness on the machine again.
#
#   usage: verify.sh
#
# Read-only, apart from the one fresh headless Claude Code session it starts
# to see which skills load. Prints one line per check, then one line per thing
# the migration left on disk for the user:
#
#   ok   <harness>: <fact>
#   FAIL <harness>: <fact>
#   left <path>: <what it is>
#
# Exit codes:
#   0  every check passed
#   1  a check failed, or the machine could not be read
#   2  usage fault

set -euo pipefail
export LC_ALL=C

# shellcheck source=lib.sh
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

if [ "$#" -ne 0 ]; then
  printf 'usage: %s\n' "$0" >&2
  exit 2
fi
has git || die "git is not on PATH"
has node || die "node is not on PATH"

FAILED=false
report() {  # <passed: true|false> <line>
  if [ "$1" = true ]; then printf 'ok   %s\n' "$2"; else printf 'FAIL %s\n' "$2"; FAILED=true; fi
}
holds() { if "$@"; then echo true; else echo false; fi; }
has_line() { printf '%s\n' "$1" | grep -qxF -- "$2"; }
has_prefix() { printf '%s\n' "$1" | grep -q -- "^$2"; }

is_copy() { [ -d "$1" ] && [ ! -L "$1" ]; }
agy_lists_team() { agy plugin list 2>/dev/null | grep -qF '"name": "team"'; }

# A full copy of the collection, not links into a directory another host reads.
collection_copied() {
  local name
  for name in $COLL_NAMES; do
    skill_copied "$1" "$name" || return 1
  done
}

compute_plan

# A machine the migration finished plans nothing.
if [ -z "$STEPS" ] && [ -z "$BLOCKS" ]; then
  report true "plan: a second run has nothing to do"
fi
while IFS="$SEP" read -r harness action arg arg2 gap; do
  [ -z "$action" ] || report false "$harness: still planned: $gap ($action ${arg:-}${arg2:+ $arg2})"
done <<< "$STEPS"
while IFS= read -r line; do
  [ -z "$line" ] || report false "blocked: $line"
done <<< "$BLOCKS"

# The pairs below are fixed tokens, split on purpose.
# shellcheck disable=SC2086
if in_list claude "$HARNESSES"; then
  for pair in "$TEAM_MARKETPLACE $TEAM_SOURCE $TEAM_ID" "$SKILLS_MARKETPLACE $SKILLS_SOURCE $SKILLS_ID"; do
    set -- $pair
    version="$(user_version "$CLAUDE_PLUGINS" "$3")"
    report "$(holds [ "$(field "$CLAUDE_MARKETS" "$1" 2)/$(field "$CLAUDE_MARKETS" "$1" 3)" = "github/$2" ])" \
      "claude: marketplace $1 from GitHub $2"
    report "$(holds [ -n "$version" ])" "claude: $3 installed (${version:-missing})"
  done
  report "$(holds [ -z "$(printf '%s\n' "$CLAUDE_PLUGINS" | cut -d "$SEP" -f1 | grep -- "@$STALE_MARKETPLACE\$")" ])" \
    "claude: no plugin from the stale $STALE_MARKETPLACE marketplace"
  # The init event lists what loaded before any model call, so a failed turn
  # does not hide it.
  session="$(cd "$HOME" && { claude -p --model haiku --max-turns 1 --output-format stream-json --verbose "Reply with OK" 2>/dev/null || true; } |
    node "$LISTING" claude-session)" || session=""
  report "$(holds has_prefix "$session" "skill${SEP}team:")" "claude: a fresh session lists team: skills"
  report "$(holds has_prefix "$session" "skill${SEP}bostonaholic:")" "claude: a fresh session lists bostonaholic: skills"
  # No check for unprefixed names here: the session also lists Claude Code's
  # built-in skills, one of them code-review. The plan above covers bare copies
  # in its skills directory.
  while IFS="$SEP" read -r id scope version enabled; do
    if [ "$scope" != user ] || [ "$enabled" != true ]; then continue; fi
    report "$(holds has_line "$session" "plugin${SEP}$id")" "claude: enabled plugin $id loads"
  done <<< "$CLAUDE_PLUGINS"
fi

# shellcheck disable=SC2086
if [ "${CODEX_OK:-}" = true ]; then
  for pair in "$TEAM_MARKETPLACE $TEAM_SOURCE $TEAM_ID" "$SKILLS_MARKETPLACE $SKILLS_SOURCE $SKILLS_ID"; do
    set -- $pair
    version="$(field "$CODEX_PLUGINS" "$3" 2)"
    report "$(holds github_url "$(field "$CODEX_MARKETS" "$1" 3)" "$2")" "codex: marketplace $1 from GitHub $2"
    report "$(holds [ -n "$version" ])" "codex: $3 installed (${version:-missing})"
  done
  report "$(holds [ -z "$(printf '%s\n' "$CODEX_PLUGINS" | cut -d "$SEP" -f1 | grep -- "@$STALE_MARKETPLACE\$")" ])" \
    "codex: no plugin from the stale $STALE_MARKETPLACE marketplace"
  shown="$(cd "$HOME" && codex debug prompt-input hi 2>/dev/null | node "$LISTING" codex-prompt)" || shown=""
  report "$(holds has_prefix "$shown" "team:")" "codex: the model sees team: skills"
  report "$(holds has_prefix "$shown" "bostonaholic:")" "codex: the model sees bostonaholic: skills"
  for name in $OLD_NAMES $TEAM_NAMES $COLL_NAMES; do
    if has_line "$shown" "$name"; then report false "codex: the model sees an unprefixed $name"; fi
  done
fi

if in_list antigravity "$DIR_HARNESSES"; then
  report "$(holds is_copy "$AGY_TEAM")" "antigravity: Team installed as a copy at $AGY_TEAM"
  report "$(holds agy_lists_team)" "antigravity: agy plugin list shows team"
fi
if in_list opencode "$DIR_HARNESSES"; then
  report "$(holds [ "$(readlink "$OPENCODE_TEAM" 2>/dev/null)" = "$(real_dir "$RELEASE_DIR")/opencode/team.js" ])" \
    "opencode: $OPENCODE_TEAM links the release clone"
fi
if in_list cursor "$DIR_HARNESSES"; then
  report "$(holds same_dir "$(cat "$CURSOR_TEAM/$CURSOR_MARKER" 2>/dev/null)" "$RELEASE_DIR")" \
    "cursor: $CURSOR_TEAM was copied from the release clone"
fi
for harness in $DIR_HARNESSES; do
  report "$(holds collection_copied "$(npx_dir "$harness")")" "$harness: every collection skill copied into $(npx_dir "$harness")"
done
if [ -n "$DIR_HARNESSES" ]; then
  report "$(holds [ "$(git -C "$RELEASE_DIR" describe --tags --exact-match HEAD 2>/dev/null)" = "$TEAM_TAG" ])" \
    "release: $RELEASE_DIR is at $TEAM_TAG"
fi

while IFS= read -r checkout; do
  if [ -z "$checkout" ] || [ ! -d "$checkout" ]; then continue; fi
  report "$(holds [ -z "$(team_hooks "$checkout")" ])" "dev install: no reinstall hooks in $checkout"
done <<< "$(cat "$CHECKOUTS_FILE" 2>/dev/null)"

while IFS= read -r dir; do
  [ -n "$dir" ] || continue
  if [ -d "$dir-retired" ]; then
    printf 'left %s: %s retired copies; delete them once you no longer need them\n' \
      "$dir-retired" "$(find "$dir-retired" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')"
  fi
  for entry in "$dir"/*; do
    if [ -L "$entry" ] && [ ! -e "$entry" ]; then printf 'left %s: a dangling link\n' "$entry"; fi
  done
done <<< "$(skill_dirs)"
LOCK="$HOME/.agents/.skill-lock.json"
for name in $(if [ -f "$LOCK" ]; then node "$LISTING" skill-lock < "$LOCK"; fi); do
  if in_list "$name" "$OLD_NAMES $TEAM_NAMES $COLL_NAMES"; then
    printf 'left %s: npx skills still tracks %s; npx skills update -g would put it back in ~/.agents/skills\n' "$LOCK" "$name"
  fi
done
if [ -n "$DIR_HARNESSES" ]; then
  printf 'left %s: the release clone %s installs Team from; keep it\n' "$RELEASE_DIR" "$DIR_HARNESSES"
fi
if [ -d "$RUN_ROOT" ]; then
  printf 'left %s: the copy of this skill the last apply ran from; delete it once verified\n' "$RUN_ROOT"
fi

[ "$FAILED" = false ]
