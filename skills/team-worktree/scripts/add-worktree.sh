#!/usr/bin/env bash
#
# Create one repository's worktree at <repo-path>/.claude/worktrees/<branch>,
# on a new branch <branch> off origin/HEAD.
#
#   usage: add-worktree.sh <home-root> <repo-path> <branch>
#
# <home-root> is the home repo's root. <repo-path> must be a direct child of
# the home root's parent directory, compared by real path; pass the home root
# as both arguments for the home repo itself. <branch> is the slash-free,
# sanitized branch name, also used as the worktree directory name.
#
# Fetches origin first. Without origin or origin/HEAD, it bases the branch on
# a local main, else a local master, and prints a warn line.
#
# Prints to stdout, one line each, path last:
#
#   warn (no origin/HEAD: based on <name>) <repo-path>
#   created <branch> <base> <worktree-path>
#   exists <branch> <worktree-path>         already registered: nothing changed
#   refused (containment) <repo-path>       outside the home repo's sibling set
#
# Exit codes:
#
#   0  created, or already exists
#   1  git failed, or no base branch: the fallback to the main tree applies
#   2  usage fault, including an unsafe or slashed <branch>
#   3  refused: <repo-path> fails containment

set -euo pipefail
export LC_ALL=C

usage() {
  printf 'usage: %s <home-root> <repo-path> <branch>\n' "$0" >&2
  exit 2
}

fail() {
  printf 'add-worktree: %s\n' "$1" >&2
  exit 1
}

[ "$#" -eq 3 ] && [ -n "$1" ] && [ -n "$2" ] || usage
HOME_ROOT="$1"
REPO="$2"
BRANCH="$3"

case "$BRANCH" in
  '' | -* | */* | *..* | *[!A-Za-z0-9._-]*)
    printf 'add-worktree: unsafe branch name %s: use - as the only delimiter\n' "'$BRANCH'" >&2
    usage ;;
esac

HOME_REAL="$(cd -P "$HOME_ROOT" 2>/dev/null && pwd -P)" || fail "cannot resolve home root '$HOME_ROOT'"
REPO_REAL="$(cd -P "$REPO" 2>/dev/null && pwd -P)" || fail "cannot resolve repo path '$REPO'"

if [ "$(dirname "$REPO_REAL")" != "$(dirname "$HOME_REAL")" ]; then
  printf 'refused (containment) %s\n' "$REPO"
  exit 3
fi

git -C "$REPO_REAL" rev-parse --git-dir >/dev/null 2>&1 || fail "'$REPO' is not a git checkout"

TARGET="$REPO_REAL/.claude/worktrees/$BRANCH"
if git -C "$REPO_REAL" worktree list --porcelain | grep -qxF "worktree $TARGET"; then
  printf 'exists %s %s\n' "$BRANCH" "$TARGET"
  exit 0
fi

BASE=""
if git -C "$REPO_REAL" fetch origin --quiet 2>/dev/null &&
  git -C "$REPO_REAL" rev-parse --verify --quiet refs/remotes/origin/HEAD >/dev/null; then
  BASE="origin/HEAD"
else
  for name in main master; do
    if git -C "$REPO_REAL" rev-parse --verify --quiet "refs/heads/$name" >/dev/null; then
      BASE="$name"
      break
    fi
  done
  [ -n "$BASE" ] || fail "no origin/HEAD and no local main or master in '$REPO'"
  printf 'warn (no origin/HEAD: based on %s) %s\n' "$BASE" "$REPO"
fi

git -C "$REPO_REAL" worktree add --quiet ".claude/worktrees/$BRANCH" -b "$BRANCH" "$BASE" >&2 ||
  fail "'git worktree add .claude/worktrees/$BRANCH -b $BRANCH $BASE' failed in '$REPO'"
printf 'created %s %s %s\n' "$BRANCH" "$BASE" "$TARGET"
