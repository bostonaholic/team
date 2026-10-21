#!/usr/bin/env bash
#
# Branch gate: a fix never commits to the repository's default branch.
#
#   usage: branch-gate.sh
#
# Run it from any directory inside the checkout to test, with no arguments.
#
# The default branch is origin/HEAD. With no origin/HEAD (no remote, or an
# unset remote head), it is whichever of `main`, then `master`, exists as a
# local branch. With neither, no branch counts as the default.
#
# Prints exactly one line to stdout:
#
#   ok <branch>   HEAD is not the default branch (`ok HEAD` when detached)
#   on-default    HEAD is the default branch
#
# Exit codes:
#
#   0  ok <branch>
#   1  on-default
#   2  usage fault
#   3  not inside a git repository with a commit, or git is not installed

set -euo pipefail

if [ "$#" -ne 0 ]; then
  printf 'usage: %s\n' "$0" >&2
  exit 2
fi

command -v git >/dev/null 2>&1 || { printf 'branch-gate: git is not installed\n' >&2; exit 3; }
if ! head="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"; then
  printf 'branch-gate: not inside a git repository with a commit: %s\n' "$PWD" >&2
  exit 3
fi

default="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || true)"
default="${default#origin/}"
if [ -z "$default" ]; then
  # The conventional default-branch names, in the order git and GitHub chose them.
  for candidate in main master; do
    if git show-ref --verify --quiet "refs/heads/$candidate"; then
      default="$candidate"
      break
    fi
  done
fi

if [ -n "$default" ] && [ "$head" = "$default" ]; then
  printf 'on-default\n'
  exit 1
fi
printf 'ok %s\n' "$head"
