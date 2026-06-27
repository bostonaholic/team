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
# so it survives field/option recreation. After editing, it RE-READS the
# authoritative project-side status and fails loudly if it does not match the
# requested column — a successful exit from item-edit is not proof the move took
# (bug #141). Prints a confirmation to stderr; stdout is left empty. Requires:
# gh (authenticated) and jq.

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

# Perform the edit. Capture its output instead of suppressing it, so a silent
# or partial failure surfaces in the error rather than being masked (bug #141).
edit_out="$(gh project item-edit \
  --project-id "$project_id" \
  --id "$item_id" \
  --field-id "$field_id" \
  --single-select-option-id "$option_id" 2>&1)" \
  || die "item-edit failed: ${edit_out:-<no output>}"

# Verify the move actually took. A clean exit from item-edit is NOT proof: a
# silent/partial write would otherwise pass unnoticed. Re-read the AUTHORITATIVE
# project-side status and fail loudly if it does not match the requested column
# (bug #141). LIMIT mirrors project-item-id.sh so a recent item past the default
# first page is still found.
LIMIT=10000
items_json="$(gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --limit "$LIMIT")" \
  || die "failed to re-read project status for verification (is gh authenticated?)"
actual="$(printf '%s' "$items_json" \
  | jq -r --arg id "$item_id" '.items[] | select(.id == $id) | .status')"
[ -n "$actual" ] \
  || die "verification failed: item $item_id not found on project $PROJECT_NUMBER after edit"

if [ "$(printf '%s' "$actual" | tr '[:upper:]' '[:lower:]')" \
     != "$(printf '%s' "$status" | tr '[:upper:]' '[:lower:]')" ]; then
  die "verification failed: requested \"$status\" but board reports \"$actual\" for $item_id — the move did not take. If the board UI looks stale, hard-refresh it (the value is authoritative here); otherwise the write did not land."
fi

printf 'set %s -> "%s" (verified)\n' "$item_id" "$status" >&2
