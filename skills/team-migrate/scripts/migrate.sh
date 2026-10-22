#!/bin/bash
#
# Move a machine set up before Team v0.147.0 onto the pipeline-only Team
# plugin plus the bostonaholic/skills plugin, in every agent harness on it.
#
#   usage: migrate.sh plan
#          migrate.sh apply <plan-id>
#          DRY_RUN=true migrate.sh apply <plan-id>
#
# `plan` reads every harness and prints the steps it would run, in order, each
# with the gap it closes and its exact command, then `Plan id: <40 hex>`. It
# changes nothing. `apply` reads every harness again and runs the steps only
# when that plan still has the id the user confirmed, from a copy of this
# skill at ${XDG_DATA_HOME:-~/.local/share}/team-migrate/run: a dev uninstall
# can remove the plugin directory the skill was started from, and verify.sh
# runs from that copy afterwards. With DRY_RUN=true it prints each command
# instead of running it, and makes no copy.
#
# Step order: the release clone, the moved skills under their new names, stale
# registrations, old copies moved to a `-retired` sibling directory, a full
# `script/dev-uninstall` from each checkout that installed Team, then Team from
# GitHub (Claude Code, Codex) or from the release clone (Antigravity, OpenCode,
# Cursor). A run that stops at any step leaves every moved skill reachable.
# No skill copy is deleted, an existing retired copy is never overwritten, and
# a second run plans nothing.
#
# Output: the plan, or one `[n/total]` line per step followed by that step's
# own output. Errors go to stderr.
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
TOOL=team-migrate
# shellcheck source=lib.sh
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

parse_command "$@"
has git || die "git is not on PATH"
has node || die "node is not on PATH"

plan_header() {
  echo "Team migration plan"
  echo "  Latest: Team $TEAM_TAG, $SKILLS_SOURCE $SKILLS_TAG"
  echo "  Harnesses on this machine: ${HARNESSES:-none}"
}

# A dev uninstall can remove the plugin directory this skill runs from, so
# apply runs from its own copy, where verify.sh stays afterwards.
run_from_copy() {
  local staging
  if same_dir "$PLUGIN_ROOT" "$RUN_ROOT"; then return 0; fi
  mkdir -p "$MIGRATE_HOME"
  staging="$(mktemp -d "$MIGRATE_HOME/.run.XXXXXX")"
  cp "$README" "$staging/README.md"
  cp -R "$PLUGIN_ROOT/skills" "$staging/skills"
  rm -rf "${RUN_ROOT:?}"
  mv "$staging" "$RUN_ROOT"
  exec "${BASH:-bash}" "$RUN_ROOT/skills/team-migrate/scripts/migrate.sh" apply "$1"
}

before_apply() {
  if [ "${DRY_RUN:-}" != true ]; then run_from_copy "$1"; fi
}

done_message() {
  echo "Done. Verify with $RUN_ROOT/skills/team-migrate/scripts/verify.sh, then restart every agent session to load the result."
}

compute_plan
run_command "$@"
