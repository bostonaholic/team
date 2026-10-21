#!/usr/bin/env bash
#
# Delete leftover directories under <repo>/.claude/worktrees/ that git no
# longer knows as worktrees and that hold only regenerable residue. A process
# anchored to a removed worktree can recreate its path after the removal.
#
#   usage: sweep-residue.sh <repo-path>
#
# A directory is residue when git worktree list does not name it, it has no
# .git entry, and every file in it lies under tmp/, .omc/, or docs/plans/.
#
# Prints to stdout, one line per directory checked, path last:
#
#   swept <dir>
#   kept (still a checkout) <dir>
#   kept (unexpected files) <dir>     followed by each such file, indented two spaces
#   no residue                        when no directory needed a check
#
# Exit codes:
#
#   0  the sweep ran
#   1  <repo-path> is not a git checkout, or git worktree list failed
#   2  usage fault
#   3  a removal failed; the lines already printed say what was swept

set -euo pipefail
export LC_ALL=C

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  printf 'usage: %s <repo-path>\n' "$0" >&2
  exit 2
fi

fail() {
  printf 'sweep-residue: %s\n' "$1" >&2
  exit "${2:-1}"
}

ROOT="$(git -C "$1" rev-parse --show-toplevel 2>/dev/null)" || fail "'$1' is not a git checkout"
LIVE="$(git -C "$ROOT" worktree list --porcelain | sed -n 's/^worktree //p')" ||
  fail "'git worktree list' failed in '$ROOT'"

checked=0
for dir in "$ROOT"/.claude/worktrees/*; do
  [ -d "$dir" ] || continue
  printf '%s\n' "$LIVE" | grep -qxF -- "$dir" && continue
  checked=1
  if [ -e "$dir/.git" ]; then
    printf 'kept (still a checkout) %s\n' "$dir"
    continue
  fi
  extra="$(find "$dir" -type f \
    -not -path "$dir/tmp/*" -not -path "$dir/.omc/*" -not -path "$dir/docs/plans/*")"
  if [ -n "$extra" ]; then
    printf 'kept (unexpected files) %s\n' "$dir"
    printf '%s\n' "$extra" | sed 's/^/  /'
  else
    rm -rf -- "${dir:?}" || fail "could not remove '$dir'" 3
    printf 'swept %s\n' "$dir"
  fi
done

[ "$checked" = 1 ] || printf 'no residue\n'
