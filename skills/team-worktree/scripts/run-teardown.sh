#!/usr/bin/env bash
#
# Run the teardown a repository declares in .teamteardown, read only from the
# copy committed to its default branch, never from any checkout.
#
#   usage: run-teardown.sh <repo-path> <branch> [<worktree>]
#
# <branch> is the branch the finished work lived on. <worktree> is the removed
# worktree's absolute path, empty or omitted for an in-place run.
#
# Each non-blank line not starting with # runs verbatim through sh -c from the
# primary clone's root, with stdin from /dev/null and these variables set:
#
#   TEAM_REPO_ROOT  the primary clone's root
#   TEAM_BRANCH     <branch>
#   TEAM_WORKTREE   <worktree>, empty when none
#
# Lines run in file order. A failing or timed-out line never stops the rest.
# Each line and its output go to stderr. Prints to stdout, one line per
# declared command, command last:
#
#   ok <command>
#   FAILED (exit <n>) <command>
#   TIMEOUT <command>
#   none (no .teamteardown on <default>)    the repo declares no teardown
#
# TEAM_TEARDOWN_TIMEOUT overrides the per-line timeout, in whole seconds.
#
# Exit codes:
#
#   0  the declaration ran, or none exists, whatever each line's outcome
#   1  refused: the primary clone failed validation, or no default branch
#   2  usage fault

set -euo pipefail
export LC_ALL=C
# Job control puts each command in its own process group, so a timeout kills
# the whole command, children included.
set -m

usage() {
  printf 'usage: %s <repo-path> <branch> [<worktree>]\n' "$0" >&2
  exit 2
}

fail() {
  printf 'run-teardown: refusing: %s\n' "$1" >&2
  exit 1
}

{ [ "$#" -eq 2 ] || [ "$#" -eq 3 ]; } && [ -n "$1" ] && [ -n "$2" ] || usage
REPO_PATH="$1"
BRANCH="$2"
WORKTREE="${3:-}"

# A teardown line that hangs is killed rather than waited out.
TIMEOUT="${TEAM_TEARDOWN_TIMEOUT:-120}"
case "$TIMEOUT" in '' | *[!0-9]* | 0) usage ;; esac
# Seconds between TERM and KILL for a line that ignores TERM.
KILL_GRACE=5

# --- Resolve and validate PRIMARY_ROOT --------------------------------------

COMMON_DIR="$(git -C "$REPO_PATH" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" ||
  fail "'$REPO_PATH' is not inside a git repository"
[ -n "$COMMON_DIR" ] || fail "cannot resolve the git dir"
PRIMARY_ROOT="$(dirname "$COMMON_DIR")"
[ "$(git -C "$PRIMARY_ROOT" rev-parse --path-format=absolute --git-dir)" = \
  "$(git -C "$PRIMARY_ROOT" rev-parse --path-format=absolute --git-common-dir)" ] &&
  [ "$PRIMARY_ROOT" = "$(git -C "$PRIMARY_ROOT" worktree list --porcelain | sed -n '1s/^worktree //p')" ] &&
  [ "$(git -C "$PRIMARY_ROOT" rev-parse --show-toplevel)" = "$PRIMARY_ROOT" ] ||
  fail "'$PRIMARY_ROOT' failed primary-clone validation: re-run from the primary clone"

# --- Detect the default branch ----------------------------------------------

DEFAULT="$(git -C "$PRIMARY_ROOT" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)" || {
  git -C "$PRIMARY_ROOT" remote set-head origin --auto >/dev/null 2>&1 || true
  DEFAULT="$(git -C "$PRIMARY_ROOT" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)" || DEFAULT=""
}
DEFAULT="${DEFAULT#origin/}"
if [ -z "$DEFAULT" ]; then
  for name in main master; do
    if git -C "$PRIMARY_ROOT" rev-parse --verify --quiet "refs/heads/$name" >/dev/null; then
      DEFAULT="$name"
      break
    fi
  done
fi
[ -n "$DEFAULT" ] || fail "no default branch found: ask the user which branch is the default"

# --- Read the declaration from the default branch only ----------------------

DECL="$(git -C "$PRIMARY_ROOT" show "origin/$DEFAULT:.teamteardown" 2>/dev/null ||
  git -C "$PRIMARY_ROOT" show "refs/heads/$DEFAULT:.teamteardown" 2>/dev/null)" || DECL=""
if [ -z "$DECL" ]; then
  printf 'none (no .teamteardown on %s)\n' "$DEFAULT"
  exit 0
fi

# --- Run each declared line -------------------------------------------------

SCRATCH="$(mktemp -d)" || fail "cannot create a scratch directory"
trap 'rm -rf -- "$SCRATCH"' EXIT
FLAG="$SCRATCH/timed-out"
cd "$PRIMARY_ROOT"

run_line() {
  local line="$1" pid watcher status=0
  rm -f -- "$FLAG"
  printf 'teardown: %s\n' "$line" >&2
  TEAM_REPO_ROOT="$PRIMARY_ROOT" TEAM_BRANCH="$BRANCH" TEAM_WORKTREE="$WORKTREE" \
    sh -c "$line" </dev/null >&2 &
  pid=$!
  (
    sleep "$TIMEOUT"
    : >"$FLAG"
    kill -TERM -- "-$pid" 2>/dev/null || exit 0
    sleep "$KILL_GRACE"
    kill -KILL -- "-$pid" 2>/dev/null || true
  ) </dev/null >/dev/null 2>&1 &
  watcher=$!
  wait "$pid" 2>/dev/null || status=$?
  kill -TERM -- "-$watcher" 2>/dev/null || true
  wait "$watcher" 2>/dev/null || true
  if [ -e "$FLAG" ]; then
    printf 'TIMEOUT %s\n' "$line"
  elif [ "$status" -eq 0 ]; then
    printf 'ok %s\n' "$line"
  else
    printf 'FAILED (exit %s) %s\n' "$status" "$line"
  fi
}

while IFS= read -r line; do
  case "$line" in '' | '#'*) continue ;; esac
  run_line "$line"
done <<<"$DECL"
