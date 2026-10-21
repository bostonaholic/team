#!/bin/sh
#
# Report what one worktree has to ship: its base branch, the commits ahead of
# that base, and its uncommitted paths. Reads git; changes nothing.
#
#   usage: ship-state.sh <worktree-path>
#
# The base is origin/HEAD's branch, or `main` when origin/HEAD is unset.
# `ahead` counts commits on HEAD that are not on origin/<base>. `dirty` counts
# `git status --porcelain` lines, so gitignored paths never count.
#
# Output, three lines in this order:
#
#   base=<branch>
#   ahead=<count>
#   dirty=<count>
#
# Exit codes:
#
#   0  reported
#   2  fault: usage, not a git worktree, or no origin/<base> ref to count against

set -eu

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  printf 'usage: %s <worktree-path>\n' "$0" >&2
  exit 2
fi
WORKTREE="$1"

if ! git -C "$WORKTREE" rev-parse --verify -q HEAD >/dev/null 2>&1; then
  printf 'ship-state.sh: not a git worktree with a commit: %s\n' "$WORKTREE" >&2
  exit 2
fi

BASE="$(git -C "$WORKTREE" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null || true)"
BASE="${BASE#origin/}"
# The skill's documented fallback when origin/HEAD is unset.
[ -n "$BASE" ] || BASE=main

if ! git -C "$WORKTREE" rev-parse --verify -q "refs/remotes/origin/$BASE" >/dev/null; then
  printf 'ship-state.sh: no origin/%s ref in %s; fetch origin or set origin/HEAD\n' "$BASE" "$WORKTREE" >&2
  exit 2
fi

AHEAD="$(git -C "$WORKTREE" rev-list --count "refs/remotes/origin/$BASE..HEAD")"
DIRTY="$(git -C "$WORKTREE" status --porcelain | wc -l | tr -d ' ')"

printf 'base=%s\nahead=%s\ndirty=%s\n' "$BASE" "$AHEAD" "$DIRTY"
