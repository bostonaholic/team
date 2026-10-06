#!/usr/bin/env bash
#
# Sweep every linked worktree and local branch in one repository whose work
# merged, so whatever an earlier session could not remove, this one removes.
#
#   usage: sweep-worktrees.sh
#
# Run it from any directory inside the repository, with no arguments. The
# invoking directory matters: the worktree that holds it is the current
# session's own, and the sweep keeps it.
#
# The merged gate for a commit: a PR from this repository's owner whose head
# commit is exactly that commit, in state MERGED, whose merge commit is in
# origin/<default>. It holds for a detached HEAD and for a squash merge. A
# HEAD with commits past the PR head fails it.
#
# Prints one line per item, and nothing else, to stdout:
#
#   pruned <git's message>               a worktree entry or tracking ref git pruned
#   removed <path> (PR #N)               a merged, clean worktree, removed without --force
#   kept (<reason>) <path>               a worktree the sweep left in place
#   report-only (<command>)              a merged worktree outside .claude/worktrees/
#   branch-deleted <branch> (PR #N)      a merged local branch no worktree holds
#
# A `kept (dirty)` line is followed by the worktree's `git status --short`
# lines, indented two spaces. Notes go to stderr.
#
# Exit codes:
#
#   0  the sweep ran, even when it kept everything
#   1  setup failed before any change: not a repository, no default branch,
#      fetch, gh, or jq
#   2  usage fault
#   3  a git command failed mid-sweep. The lines already printed say what
#      the sweep changed

set -euo pipefail
export LC_ALL=C

if [ "$#" -ne 0 ]; then
  printf 'usage: %s\n' "$0" >&2
  exit 2
fi

fail() {
  printf 'sweep-worktrees: %s\n' "$1" >&2
  exit 1
}

stop() {
  printf 'sweep-worktrees: stopped mid-sweep: %s\n' "$1" >&2
  exit 3
}

# Only the most recent PRs are read. A worktree for an older merged PR fails
# the gate and is kept, which is the safe way to fail.
PR_LIMIT=300

command -v jq >/dev/null 2>&1 || fail "jq is not installed: install it and re-run"
command -v gh >/dev/null 2>&1 || fail "gh is not installed: install it and re-run"

# --- Resolve and validate PRIMARY_ROOT --------------------------------------

INVOKE_DIR="$(pwd -P)" || fail "refusing: cannot resolve the invoking directory"
COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" ||
  fail "refusing: '$INVOKE_DIR' is not inside a git repository"
[ -n "$COMMON_DIR" ] || fail "refusing: cannot resolve the git dir"
PRIMARY_ROOT="$(dirname "$COMMON_DIR")"
[ "$(git -C "$PRIMARY_ROOT" rev-parse --path-format=absolute --git-dir)" = \
  "$(git -C "$PRIMARY_ROOT" rev-parse --path-format=absolute --git-common-dir)" ] &&
  [ "$PRIMARY_ROOT" = "$(git -C "$PRIMARY_ROOT" worktree list --porcelain | sed -n '1s/^worktree //p')" ] &&
  [ "$(git -C "$PRIMARY_ROOT" rev-parse --show-toplevel)" = "$PRIMARY_ROOT" ] ||
  fail "refusing: '$PRIMARY_ROOT' failed primary-clone validation: re-run from the primary clone"
REPO="$(cd "$PRIMARY_ROOT" && gh repo view --json nameWithOwner --jq .nameWithOwner)" || REPO=""
[ -n "$REPO" ] || fail "refusing: cannot resolve <owner>/<repo>: run 'gh auth status', fix what it reports, and re-run"
OWNER="${REPO%%/*}"

# The sweep never removes its own working directory: the invoking directory is
# kept by the current-session rule, and the process itself moves out.
cd "$PRIMARY_ROOT"
PRIMARY_REAL="$(pwd -P)"

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
[ -n "$DEFAULT" ] ||
  fail "refusing: no default branch: set origin/HEAD with 'git remote set-head origin --auto'"
DEFAULT_LOWER="$(printf '%s' "$DEFAULT" | tr '[:upper:]' '[:lower:]')"

git -C "$PRIMARY_ROOT" fetch -q origin || fail "refusing: 'git fetch origin' failed, so merged state is unknown"

# --- Fetch PR state once, and keep only well-formed rows --------------------
#
# Every setup step, this one included, runs before the first change, so a
# setup failure leaves the repository as it was.
#
# PR metadata is untrusted data. Only the structured fields below reach the
# gate, and none of them reaches a shell argument except a commit OID that
# passed the hex check.

PR_JSON="$(gh pr list --repo "$REPO" --state all --limit "$PR_LIMIT" \
  --json number,state,headRefOid,headRepositoryOwner,mergeCommit </dev/null)" ||
  fail "refusing: 'gh pr list --repo $REPO' failed, so merged state is unknown"
printf '%s' "$PR_JSON" | jq -e 'type == "array"' >/dev/null 2>&1 ||
  fail "refusing: 'gh pr list' did not return a JSON array"
PR_ROWS="$(printf '%s' "$PR_JSON" | jq -r '
  .[]
  | select(type == "object"
      and (.number | type) == "number"
      and (.state | type) == "string"
      and (.headRefOid | type) == "string"
      and (.headRepositoryOwner | type) == "object"
      and (.headRepositoryOwner.login | type) == "string")
  | [(.number | tostring), .state, .headRepositoryOwner.login, .headRefOid,
     (if (.mergeCommit | type) == "object" and (.mergeCommit.oid | type) == "string"
      then .mergeCommit.oid else "" end)]
  | @tsv')" || fail "refusing: could not read 'gh pr list' output"

# A full object ID: 40 hex digits under SHA-1, 64 under SHA-256.
is_oid() {
  case "$1" in
    *[!0-9a-f]*) return 1 ;;
  esac
  [ "${#1}" -eq 40 ] || [ "${#1}" -eq 64 ]
}

# Prints the number of a same-owner PR in STATE whose head is exactly OID, and
# for MERGED, whose merge commit is in origin/$DEFAULT. Fails when none is.
pr_for() {
  local want_state="$1" oid="$2" number state login head merge
  while IFS=$'\t' read -r number state login head merge; do
    [ "$state" = "$want_state" ] && [ "$login" = "$OWNER" ] && [ "$head" = "$oid" ] || continue
    case "$number" in ''|*[!0-9]*) continue ;; esac
    if [ "$state" = MERGED ]; then
      is_oid "$merge" || continue
      git -C "$PRIMARY_ROOT" merge-base --is-ancestor "$merge" "origin/${DEFAULT:?}" 2>/dev/null || continue
    fi
    printf '%s\n' "$number"
    return 0
  done <<<"$PR_ROWS"
  return 1
}

# Succeeds when PATH_REAL is DIR or lies under it, on a path-segment boundary.
inside() {
  case "$1" in
    "$2" | "$2"/*) return 0 ;;
  esac
  return 1
}

# --- Prune worktree entries whose directory is gone ------------------------
#
# git reports each pruned entry on stderr as "Removing <entry>: <reason>".
# Any other line is an error, and goes to stderr unchanged.

git -C "$PRIMARY_ROOT" worktree prune -v 2>&1 |
  while IFS= read -r line; do
    case "$line" in
      "Removing "*) printf 'pruned %s\n' "${line#Removing }" ;;
      *) printf '%s\n' "$line" >&2 ;;
    esac
  done || stop "'git worktree prune' failed"

# --- Sweep each linked worktree --------------------------------------------

LSOF_CWDS=""
if command -v lsof >/dev/null 2>&1; then
  LSOF_CWDS="$(lsof -a -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')" || true
else
  printf 'note: lsof not found, so the in-use check is skipped\n' >&2
fi

in_use() {
  local cwd
  [ -n "$LSOF_CWDS" ] || return 1
  while IFS= read -r cwd; do
    inside "$cwd" "$1" && return 0
  done <<<"$LSOF_CWDS"
  return 1
}

# Emits one "<path>\t<head>\t<locked>" row per linked worktree. The first
# porcelain record is the primary clone, which the sweep never touches.
linked_worktrees() {
  local line path="" head="" locked="" first=1
  git -C "$PRIMARY_ROOT" worktree list --porcelain -z |
    while IFS= read -r -d '' line; do
      case "$line" in
        "worktree "*) path="${line#worktree }"; head=""; locked="" ;;
        "HEAD "*) head="${line#HEAD }" ;;
        locked | "locked "*) locked=1 ;;
        "")
          [ "$first" = 1 ] || printf '%s\t%s\t%s\n' "$path" "$head" "$locked"
          first=0 ;;
      esac
    done
}

sweep_worktree() {
  local path="$1" head="$2" locked="$3" real number status
  real="$(cd "$path" 2>/dev/null && pwd -P)" || real="$path"

  if inside "$INVOKE_DIR" "$real"; then
    printf 'kept (current session: a later sweep removes it once its PR is merged) %s\n' "$path"
    return
  fi
  if in_use "$real"; then
    printf 'kept (in use) %s\n' "$path"
    return
  fi
  if ! is_oid "$head" || ! number="$(pr_for MERGED "$head")"; then
    if is_oid "$head" && number="$(pr_for CLOSED "$head")"; then
      printf 'kept (PR #%s closed without merging: reopen the PR, or remove the worktree by hand to abandon the work) %s\n' "$number" "$path"
    else
      printf 'kept (no merged PR) %s\n' "$path"
    fi
    return
  fi
  case "$real" in
    "$PRIMARY_REAL"/.claude/worktrees/?*) ;;
    *)
      printf 'report-only (git -C %q worktree remove %q)\n' "$PRIMARY_ROOT" "$path"
      return ;;
  esac
  if [ -n "$locked" ]; then
    printf 'kept (locked: unlock it with git worktree unlock) %s\n' "$path"
    return
  fi
  # No --force, ever: ignored files do not block a removal, and untracked or
  # modified files are work this sweep has no gate to discard.
  if git -C "${PRIMARY_ROOT:?}" worktree remove "${path:?}" 2>/dev/null; then
    printf 'removed %s (PR #%s)\n' "$path" "$number"
    return
  fi
  status="$(git -C "$path" status --short 2>&1)" || true
  if [ -n "$status" ]; then
    printf 'kept (dirty) %s\n' "$path"
    printf '%s\n' "$status" | sed 's/^/  /'
  else
    printf 'kept (git refused the removal) %s\n' "$path"
  fi
}

WORKTREES="$(linked_worktrees)" || stop "'git worktree list' failed"
if [ -n "$WORKTREES" ]; then
  while IFS=$'\t' read -r path head locked; do
    sweep_worktree "$path" "$head" "$locked"
  done <<<"$WORKTREES"
fi

# --- Delete merged local branches no worktree holds ------------------------

CHECKED_OUT="$(git -C "$PRIMARY_ROOT" worktree list --porcelain | sed -n 's|^branch refs/heads/||p')" ||
  stop "'git worktree list' failed"

git -C "$PRIMARY_ROOT" for-each-ref --format='%(refname)%09%(objectname)' refs/heads |
  while IFS=$'\t' read -r ref oid; do
    branch="${ref#refs/heads/}"
    grep -qxF -- "$branch" <<<"$CHECKED_OUT" && continue
    case "$(printf '%s' "$branch" | tr '[:upper:]' '[:lower:]')" in
      "$DEFAULT_LOWER" | master | develop | release/*) continue ;;
    esac
    number="$(pr_for MERGED "$oid")" || continue
    case "$branch" in
      '' | -* | *..* | *[!A-Za-z0-9._/-]*)
        printf 'kept (unsafe branch name: delete it by hand) %s\n' "$branch"
        continue ;;
    esac
    if git -C "${PRIMARY_ROOT:?}" branch -D -- "${branch:?}" >/dev/null 2>&1; then
      printf 'branch-deleted %s (PR #%s)\n' "$branch" "$number"
    else
      printf 'kept (git refused the delete) %s\n' "$branch"
    fi
  done || stop "'git for-each-ref refs/heads' failed"

# --- Sever stale tracking refs ---------------------------------------------

git -C "$PRIMARY_ROOT" remote prune origin |
  sed -n 's/^ \* \[pruned\] /pruned /p' ||
  printf 'note: git remote prune origin failed\n' >&2
