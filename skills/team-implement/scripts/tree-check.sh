#!/usr/bin/env bash
#
# Detect a change to the worktree across the reviewer dispatch: record HEAD
# and the status before it, then compare after it.
#
#   usage: tree-check.sh snapshot
#          tree-check.sh compare
#
# Run both from the same worktree, with no other arguments. `snapshot`
# records `git rev-parse HEAD` and
# `git status --porcelain --untracked-files=all --no-renames` in that
# worktree's git directory, which the status never lists, and prints
# nothing. A rerun replaces the record.
#
# `compare` takes the same reading again and prints one line per change, and
# nothing else, to stdout:
#
#   head <old-sha> <new-sha>   HEAD moved
#   path <path>                a status line for <path> appeared, vanished,
#                              or changed
#
# The head line comes first, then path lines sorted bytewise, one per path.
# The record is kept, so a compare can rerun.
#
# Exit codes:
#
#   0  snapshot recorded, or compare found no change
#   1  compare found a change; stdout names each one
#   2  usage fault, git missing, not inside a worktree, HEAD or status
#      unreadable, or compare with no snapshot recorded

set -euo pipefail
export LC_ALL=C

die() {
  printf 'tree-check: %s\n' "$1" >&2
  exit 2
}

if [ "$#" -ne 1 ] || { [ "$1" != snapshot ] && [ "$1" != compare ]; }; then
  printf 'usage: %s snapshot|compare\n' "$0" >&2
  exit 2
fi
MODE="$1"

command -v git >/dev/null 2>&1 || die 'git not found'
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die 'not inside a git worktree'

# Inside the git directory, so writing the record never changes the status it records.
RECORD="$(git rev-parse --git-path team-tree-check)" || die 'cannot resolve the git directory'

# --no-renames gives one path per line; quotePath=false prints non-ASCII paths raw.
read_tree() {
  git rev-parse --verify --quiet HEAD || die 'cannot resolve HEAD'
  git -c core.quotePath=false status --porcelain --untracked-files=all --no-renames ||
    die 'git status failed'
}

if [ "$MODE" = snapshot ]; then
  read_tree >"$RECORD.tmp"
  mv "$RECORD.tmp" "$RECORD"
  exit 0
fi

[ -f "$RECORD" ] || die "no snapshot recorded; run 'tree-check.sh snapshot' before the dispatch"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
read_tree >"$WORK/now"

OLD_HEAD="$(sed -n 1p "$RECORD")"
NEW_HEAD="$(sed -n 1p "$WORK/now")"
sed 1d "$RECORD" | sort >"$WORK/before"
sed 1d "$WORK/now" | sort >"$WORK/after"

# comm -3 prefixes column-2 lines with a tab; a status line is "XY <path>", so the path starts at column 4.
comm -3 "$WORK/before" "$WORK/after" | sed "s/^$(printf '\t')//" | cut -c4- | sort -u >"$WORK/paths"

CHANGED=0
if [ "$OLD_HEAD" != "$NEW_HEAD" ]; then
  printf 'head %s %s\n' "$OLD_HEAD" "$NEW_HEAD"
  CHANGED=1
fi
if [ -s "$WORK/paths" ]; then
  sed 's/^/path /' "$WORK/paths"
  CHANGED=1
fi
exit "$CHANGED"
