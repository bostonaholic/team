#!/bin/bash
#
# Update Team to its latest release tag in every agent harness where Team is
# already installed from a release.
#
#   usage: update.sh plan
#          update.sh apply <plan-id>
#          DRY_RUN=true update.sh apply <plan-id>
#
# `plan` reads every harness and prints the steps it would run, in order, each
# with the gap it closes and its exact command, then `Plan id: <40 hex>`. It
# changes nothing. `apply` reads every harness again and runs the steps only
# when that plan still has the id the user confirmed. With DRY_RUN=true it
# prints each command instead of running it.
#
# This is not team-migrate. It installs Team into no harness that lacks it,
# retires no skill copy, and never touches the bostonaholic/skills collection.
# It sources team-migrate's lib.sh for harness detection, the plan steps, and
# the plan runner, so both scripts plan and run a step the same way.
#
# Decisions:
#   Release installs   Claude Code and Codex from the GitHub marketplace;
#                      Antigravity as a copied directory; OpenCode as a link
#                      into the release clone; Cursor as a copy marked with
#                      the release clone. Each is updated with team-migrate's
#                      own steps: marketplace refresh then plugin update, or
#                      release clone update then reinstall.
#   Not installed      A harness on the machine without Team gets a `left`
#                      line, never a step.
#   Dev installs       A marketplace from a local directory (Claude Code,
#                      Codex), an Antigravity or OpenCode link into any other
#                      checkout, and a Cursor copy of another checkout are
#                      left alone, with the checkout named: the developer
#                      pulls it and reruns script/dev-install. Replacing one
#                      with a release would drop the checkout's live edits
#                      and leave its pull hooks reinstalling it.
#   Unrecognized       A path Team's install did not make (an Antigravity
#                      link target that is not a directory, an OpenCode
#                      regular file, a Cursor copy without Team's marker) is
#                      left alone with a `left` line, not a blocker, so one
#                      odd harness does not stop the others. A Claude Code or
#                      Codex marketplace from another source does block, as
#                      in team-migrate: plan_team names the remedy.
#   Antigravity copy   Counted among the harnesses with Team always, but needs
#                      the release clone only when its version is behind, so a
#                      current copy with no clone plans nothing.
#   Run in place       Apply runs from this skill's own directory. It runs no
#                      dev uninstall, and git and the plugin hosts replace
#                      files instead of editing them, so the open script
#                      stays readable.
#
# Output: the plan, or one `[n/total]` line per step followed by that step's
# own output. A plan with nothing to run prints `Nothing to do.`, then any
# `Left as they are:` lines. Errors go to stderr.
#
# Exit codes:
#   0  plan printed, or every step ran
#   1  a step failed; its line names it and the steps not run, or the
#      machine could not be read
#   2  usage fault
#   3  the plan changed since it was confirmed; nothing ran
#   4  the plan is blocked; nothing ran

set -euo pipefail
export LC_ALL=C

# shellcheck disable=SC2034  # names this script in lib.sh's messages
TOOL=team-update
# shellcheck source=../../team-migrate/scripts/lib.sh
. "$(cd "$(dirname "$0")" && pwd)/../../team-migrate/scripts/lib.sh"

parse_command "$@"
has git || die "git is not on PATH"
has node || die "node is not on PATH"

keep() {  # <harness> [dir: the harness needs the release clone]
  HARNESSES="$HARNESSES $1"
  if [ "${2:-}" = dir ]; then DIR_HARNESSES="$DIR_HARNESSES $1"; fi
}
leave() { LEFT="$LEFT$1$NL"; }
absent() { leave "$1: Team is not installed; run /team-migrate or follow INSTALL.md to install it"; }
dev_install() { leave "$1: dev install from $2; pull that checkout and rerun script/dev-install"; }
foreign() { leave "$1: $2 was not made by Team's install; leaving it"; }

classify_claude() {
  local source
  if [ -z "$(user_version "$CLAUDE_PLUGINS" "$TEAM_ID")" ]; then absent claude; return 0; fi
  source="$(field "$CLAUDE_MARKETS" "$TEAM_MARKETPLACE" 2)"
  case "$source" in
    directory) dev_install claude "$(field "$CLAUDE_MARKETS" "$TEAM_MARKETPLACE" 3)" ;;
    "") leave "claude: Team's '$TEAM_MARKETPLACE' marketplace is missing; run /team-migrate" ;;
    *) keep claude ;;
  esac
}

classify_codex() {
  local source
  # A failed read is already a blocker.
  if [ "${CODEX_OK:-}" != true ]; then return 0; fi
  if [ -z "$(field "$CODEX_PLUGINS" "$TEAM_ID" 2)" ]; then absent codex; return 0; fi
  source="$(field "$CODEX_MARKETS" "$TEAM_MARKETPLACE" 2)"
  case "$source" in
    local) dev_install codex "$(field "$CODEX_MARKETS" "$TEAM_MARKETPLACE" 4)" ;;
    "") leave "codex: Team's '$TEAM_MARKETPLACE' marketplace is missing; run /team-migrate" ;;
    *) keep codex ;;
  esac
}

classify_antigravity() {
  if [ -L "$AGY_TEAM" ]; then dev_install antigravity "$(readlink "$AGY_TEAM")"
  elif [ -d "$AGY_TEAM" ]; then
    if [ "$(plugin_version "$AGY_TEAM/plugin.json")" = "$TEAM_VERSION" ]; then keep antigravity; else keep antigravity dir; fi
  elif present "$AGY_TEAM"; then foreign antigravity "$AGY_TEAM"
  else absent antigravity; fi
}

classify_opencode() {
  local owner
  if [ -L "$OPENCODE_TEAM" ]; then
    owner="$(dirname "$(dirname "$(readlink "$OPENCODE_TEAM")")")"
    if same_dir "$owner" "$RELEASE_DIR"; then keep opencode dir; else dev_install opencode "$owner"; fi
  elif present "$OPENCODE_TEAM"; then foreign opencode "$OPENCODE_TEAM"
  else absent opencode; fi
}

classify_cursor() {
  local marker=""
  if [ ! -e "$CURSOR_TEAM" ] && [ ! -L "$CURSOR_TEAM" ]; then absent cursor; return 0; fi
  if [ -f "$CURSOR_TEAM/$CURSOR_MARKER" ]; then marker="$(cat "$CURSOR_TEAM/$CURSOR_MARKER")"; fi
  if [ -L "$CURSOR_TEAM" ] || [ -z "$marker" ]; then foreign cursor "$CURSOR_TEAM"
  elif same_dir "$marker" "$RELEASE_DIR"; then keep cursor dir
  else dev_install cursor "$marker"; fi
}

compute_update() {
  local harness installed
  # shellcheck disable=SC2034  # plan_team and the plan runner read these
  STEPS="" BLOCKS="" LEFT="" TEAM_REMOVED=false RELEASE_MOVES=false DIR_HARNESSES=""
  installed="$(harnesses)"
  TEAM_TAG="$(latest_tag "$TEAM_URL")" || TEAM_TAG=""
  [ -n "$TEAM_TAG" ] || die "cannot read Team's release tags from $TEAM_URL"
  TEAM_VERSION="${TEAM_TAG#v}"
  if in_list claude "$installed"; then read_claude; fi
  if in_list codex "$installed"; then read_codex; fi
  HARNESSES=""
  for harness in $installed; do "classify_$harness"; done
  HARNESSES="${HARNESSES# }" DIR_HARNESSES="${DIR_HARNESSES# }"
  # plan_team plans Codex whenever the read worked, so a Codex without Team
  # must read as not read.
  if ! in_list codex "$HARNESSES"; then CODEX_OK=false; fi
  plan_release
  plan_team
  # shellcheck disable=SC2034  # read by the plan runner in lib.sh
  SESSIONS="$(other_sessions)" || SESSIONS=""
}

plan_header() {
  echo "Team update plan"
  echo "  Latest: Team $TEAM_TAG"
  echo "  Harnesses with Team from a release: ${HARNESSES:-none}"
}

before_apply() { :; }

done_message() {
  echo "Done. Run plan again to confirm, then restart every agent session to load the update."
}

compute_update
run_command "$@"
