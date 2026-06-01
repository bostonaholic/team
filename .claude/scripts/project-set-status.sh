#!/usr/bin/env bash
#
# project-set-status.sh — set a board item's Status column by name.
#
# Single responsibility: given a board item ID and a column name, set the
# Status field of that item on the "🤖 Team" board
# (https://github.com/users/bostonaholic/projects/5).
#
# Dev-only, non-distributed (lives under .claude/, not hooks/) per the
# runtime-vs-development split in CLAUDE.md / AGENTS.md.
#
# Usage:
#   .claude/scripts/project-set-status.sh <status> [item-id]
#
# The item ID comes from the second argument, or — when it is omitted or "-" —
# from stdin, so this composes as the sink of a pipe:
#   project-item-id.sh 42 | project-set-status.sh "In review"
#
# <status> is the column name, case-insensitive:
#   Backlog | Ready | In progress | In review | Done
#
# Resolves the project, Status field, and target option IDs at runtime by name,
# so it survives field/option recreation. Prints a confirmation to stderr;
# stdout is left empty. Requires: gh (authenticated) and jq.

set -uo pipefail

OWNER="bostonaholic"
PROJECT_NUMBER="5"

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

{ [ "$#" -ge 1 ] && [ "$#" -le 2 ]; } || die "usage: $(basename "$0") <status> [item-id]"
status="$1"
item_id="${2:--}"

command -v gh >/dev/null 2>&1 || die "gh CLI not found"
command -v jq >/dev/null 2>&1 || die "jq not found"

# Item ID from stdin when not given as an argument.
if [ "$item_id" = "-" ]; then
  read -r item_id || true
fi
[ -n "${item_id:-}" ] \
  || die "no item id — pass as an argument or pipe one in from project-item-id.sh"

# Status field ID + the option ID for the requested column (case-insensitive).
fields_json="$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json)" \
  || die "failed to list project fields (is gh authenticated?)"
read -r field_id option_id <<EOF
$(printf '%s' "$fields_json" | jq -r --arg s "$status" '
  .fields[] | select(.name == "Status") | .id as $fid
  | .options[] | select((.name | ascii_downcase) == ($s | ascii_downcase))
  | "\($fid) \(.id)"')
EOF
{ [ -n "${field_id:-}" ] && [ -n "${option_id:-}" ]; } \
  || die "unknown status: '$status' (valid: Backlog, Ready, In progress, In review, Done)"

project_id="$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq '.id')" \
  || die "failed to resolve project id"

gh project item-edit \
  --project-id "$project_id" \
  --id "$item_id" \
  --field-id "$field_id" \
  --single-select-option-id "$option_id" \
  >/dev/null \
  || die "item-edit failed"

printf 'set %s -> "%s"\n' "$item_id" "$status" >&2
