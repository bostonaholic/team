#!/usr/bin/env bash
#
# Classify one repository's current checkout before worktree creation, so a
# worktree is never nested inside another.
#
#   usage: detect-worktree.sh <repo-path>
#
# Prints exactly one line to stdout:
#
#   create                    not a linked worktree: create one
#   reuse <branch> <path>     a linked worktree on a non-default branch: reuse it
#   refuse <branch> <path>    a linked worktree on the default branch: stop
#
# <path> is the checkout's top level and is always last, so it may hold spaces.
# A detached HEAD reports <branch> as HEAD, which is never the default branch.
#
# The default branch is origin/HEAD, else a local main, else a local master.
#
# Exit codes:
#
#   0  classified
#   1  <repo-path> is not a git checkout, or a linked worktree's default
#      branch cannot be resolved
#   2  usage fault

set -euo pipefail
export LC_ALL=C

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  printf 'usage: %s <repo-path>\n' "$0" >&2
  exit 2
fi
REPO="$1"

fail() {
  printf 'detect-worktree: %s\n' "$1" >&2
  exit 1
}

GIT_DIR="$(git -C "$REPO" rev-parse --path-format=absolute --git-dir 2>/dev/null)" ||
  fail "'$REPO' is not a git checkout"
COMMON_DIR="$(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir)" ||
  fail "cannot resolve the common git dir of '$REPO'"

if [ "$GIT_DIR" = "$COMMON_DIR" ]; then
  printf 'create\n'
  exit 0
fi

TOP="$(git -C "$REPO" rev-parse --show-toplevel)" || fail "cannot resolve the top level of '$REPO'"
BRANCH="$(git -C "$REPO" rev-parse --abbrev-ref HEAD)" || fail "cannot resolve HEAD in '$TOP'"

DEFAULT="$(git -C "$REPO" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)" || DEFAULT=""
DEFAULT="${DEFAULT#origin/}"
if [ -z "$DEFAULT" ]; then
  for name in main master; do
    if git -C "$REPO" rev-parse --verify --quiet "refs/heads/$name" >/dev/null; then
      DEFAULT="$name"
      break
    fi
  done
fi
[ -n "$DEFAULT" ] ||
  fail "no default branch in '$TOP': set origin/HEAD with 'git remote set-head origin --auto'"

if [ "$BRANCH" = "$DEFAULT" ]; then
  printf 'refuse %s %s\n' "$BRANCH" "$TOP"
else
  printf 'reuse %s %s\n' "$BRANCH" "$TOP"
fi
