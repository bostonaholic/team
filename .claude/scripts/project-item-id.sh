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

# `gh project item-list` defaults to 30 items; an active board has far more, so
# a recent issue/PR (the common case for this resolver) falls past the first
# page and was silently missed. Request a high limit. Guard against silent
# truncation: if the board ever exceeds LIMIT, warn on stderr (stdout stays
# pipe-clean) rather than failing to find an item that is genuinely on the board.
LIMIT=10000
items_json="$(gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --limit "$LIMIT")" \
  || die "failed to list project items (is gh authenticated?)"

total="$(printf '%s' "$items_json" | jq -r '.totalCount // (.items | length)')"
fetched="$(printf '%s' "$items_json" | jq -r '.items | length')"
if [ "${total:-0}" -gt "${fetched:-0}" ]; then
  printf 'warning: board has %s items but only %s fetched (limit %s) — raise LIMIT in %s\n' \
    "$total" "$fetched" "$LIMIT" "$(basename "$0")" >&2
fi

item_id="$(printf '%s' "$items_json" \
  | jq -r --argjson n "$issue" '.items[] | select(.content.number == $n) | .id')"
[ -n "$item_id" ] \
  || die "issue #$issue is not on project $PROJECT_NUMBER — add it to the board first"

printf '%s\n' "$item_id"
