#!/usr/bin/env bash
#
# project-item-id.sh — print the GitHub Project board item ID for an issue.
#
# Single responsibility: resolve <issue-number> -> board item ID (PVTI_…) on the
# "🤖 Team" board (https://github.com/users/bostonaholic/projects/5).
#
# Dev-only, non-distributed (lives under .claude/, not hooks/) per the
# runtime-vs-development split in CLAUDE.md / AGENTS.md.
#
# Usage:
#   .claude/scripts/project-item-id.sh <issue-number>
#
# Writes the item ID to stdout (and nothing else, so it pipes cleanly); exits
# non-zero if the issue is not on the board. Compose with project-set-status.sh:
#   project-item-id.sh 42 | project-set-status.sh "In review"
#
# Requires: gh (authenticated) and jq.

set -uo pipefail

OWNER="bostonaholic"
PROJECT_NUMBER="5"

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

[ "$#" -eq 1 ] || die "usage: $(basename "$0") <issue-number>"
issue="$1"

command -v gh >/dev/null 2>&1 || die "gh CLI not found"
command -v jq >/dev/null 2>&1 || die "jq not found"

case "$issue" in
  ''|*[!0-9]*) die "issue number must be numeric: '$issue'" ;;
esac

item_id="$(gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json \
  | jq -r --argjson n "$issue" '.items[] | select(.content.number == $n) | .id')" \
  || die "failed to list project items (is gh authenticated?)"
[ -n "$item_id" ] \
  || die "issue #$issue is not on project $PROJECT_NUMBER — add it to the board first"

printf '%s\n' "$item_id"
