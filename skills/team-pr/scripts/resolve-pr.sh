#!/usr/bin/env bash
#
# Resolve one invocation string into the PR every later step acts on.
#
#   usage: resolve-pr.sh <arguments> <run-dir>
#
#   <arguments>  the whole invocation: "<pr-number-or-url> [--entries <path>]"
#   <run-dir>    an existing directory this run owns
#
# Writes one value per file into <run-dir>, and nothing to stdout:
#
#   pr-url        the canonical URL `gh` resolved, on the BASE repository
#   pr-host       its host — github.com, or the GitHub Enterprise host
#   owner, repo   its owner and repository segments
#   number        its PR number
#   repo-spec     gh's own [HOST/]OWNER/REPO form, for every later --repo
#   entries-file  the --entries path, or empty when none was given
#
# Exit codes:
#
#   0  resolved
#   1  refused — a malformed, repeated, or unresolvable argument. Nothing ran
#      against the network that could change anything, and nothing is written
#   2  usage fault — wrong argument count, or a run directory that is not one

set -euo pipefail

if [ "$#" -ne 2 ]; then
  printf 'usage: %s <arguments> <run-dir>\n' "$0" >&2
  exit 2
fi
ARGUMENTS="$1"
RUN_DIR="$2"
if [ ! -d "$RUN_DIR" ]; then
  printf 'run directory does not exist: %s\n' "$RUN_DIR" >&2
  exit 2
fi

# --- Split the arguments before validating any of them ----------------------
#
# The shebang pins bash, so splitting an unquoted parameter expansion is this
# file's own behaviour rather than the host shell's: under zsh the same line
# binds the whole string as one token. `set -f` keeps a token from globbing.

PR_ARG=''
ENTRIES_FILE=''
PENDING=''

set -f
# shellcheck disable=SC2086 # the split is the point; `set -f` bounds it
set -- $ARGUMENTS
set +f

for TOKEN in "$@"; do
  if [ -n "$PENDING" ]; then
    ENTRIES_FILE="$TOKEN"
    PENDING=''
    continue
  fi
  case "$TOKEN" in
    --entries)
      # A second value overwriting the first would upload from a manifest
      # the caller never named. "The last one wins" is a guess.
      if [ -n "$ENTRIES_FILE" ]; then
        printf 'more than one --entries\n' >&2
        exit 1
      fi
      PENDING=1
      ;;
    --entries=*)
      if [ -n "$ENTRIES_FILE" ]; then
        printf 'more than one --entries\n' >&2
        exit 1
      fi
      ENTRIES_FILE="${TOKEN#--entries=}"
      ;;
    --*)
      printf 'unknown flag: %s\n' "$TOKEN" >&2
      exit 1
      ;;
    *)
      # An entries path holding a space arrives as two tokens and lands
      # here: a loud refusal, never a silently truncated path.
      if [ -n "$PR_ARG" ]; then
        printf 'more than one PR argument\n' >&2
        exit 1
      fi
      PR_ARG="$TOKEN"
      ;;
  esac
done

if [ -n "$PENDING" ]; then
  printf -- '--entries needs a path\n' >&2
  exit 1
fi

# --- Validate the PR token alone --------------------------------------------
#
# The host segment is a charset, not a literal `github.com`: this skill
# handles GitHub Enterprise in three later places, and an anchored-at-
# github.com pattern refuses every Enterprise URL before they run. Never
# `[^/]+` for an owner or repository — that admits `$`, backticks, and spaces.

PR_URL_PATTERN='^https://[A-Za-z0-9.-]{1,253}/[A-Za-z0-9._-]{1,39}/[A-Za-z0-9._-]{1,100}/pull/[0-9]+$'

ARG_HOST=''
ARG_OWNER=''
ARG_REPO=''
case "$PR_ARG" in
  ''|*[!0-9]*) ARG_NUMBER='' ;;     # not a bare PR number
  *)           ARG_NUMBER="$PR_ARG" ;;
esac

if [ -z "$ARG_NUMBER" ]; then
  if [[ ! "$PR_ARG" =~ $PR_URL_PATTERN ]]; then
    printf 'malformed PR argument\n' >&2
    exit 1
  fi
  REST="${PR_ARG#https://}"
  ARG_HOST="${REST%%/*}"  ; REST="${REST#*/}"
  ARG_OWNER="${REST%%/*}" ; REST="${REST#*/}"
  ARG_REPO="${REST%%/*}"
  ARG_NUMBER="${PR_ARG##*/}"
fi

# --- Resolve it once --------------------------------------------------------
#
# With --repo whenever the argument supplied one: `gh pr view` receives the
# number alone, and with no --repo it resolves against the CURRENT
# DIRECTORY's default repository — so a full URL for one repository, run from
# a checkout of another, silently resolves the other's PR of that number.

if [ -n "$ARG_OWNER" ]; then
  if ! PR_URL="$(gh pr view "$ARG_NUMBER" --repo "$ARG_HOST/$ARG_OWNER/$ARG_REPO" --json url --jq .url </dev/null)"; then
    printf 'could not resolve the PR: %s\n' "$PR_ARG" >&2
    exit 1
  fi
else
  # The bare-number form has no repository of its own and resolves against the
  # checkout by design; with no checkout it resolves nothing.
  if ! PR_URL="$(gh pr view "$ARG_NUMBER" --json url --jq .url </dev/null)"; then
    printf 'could not resolve PR %s — a bare number needs a local checkout, so pass the full PR URL\n' \
      "$ARG_NUMBER" >&2
    exit 1
  fi
fi

# Guarded: stripping a literal `https://github.com/` prefix is a no-op on
# every other host, leaving OWNER as `https:` for every later --repo.
case "$PR_URL" in
  https://*/*/*/pull/[0-9]*) : ;;
  *)
    printf 'resolution returned something that is not a PR URL: %s\n' "$PR_URL" >&2
    exit 1
    ;;
esac
REST="${PR_URL#https://}"
PR_HOST="${REST%%/*}" ; REST="${REST#*/}"
OWNER="${REST%%/*}"   ; REST="${REST#*/}"
REPO="${REST%%/*}"
NUMBER="${PR_URL##*/}"
case "$PR_HOST$OWNER$REPO" in
  *[!A-Za-z0-9._-]*)
    printf 'resolved host, owner, or repository carries an unexpected character: %s\n' "$PR_URL" >&2
    exit 1
    ;;
esac
case "$NUMBER" in
  ""|*[!0-9]*)
    printf 'resolved PR number is not a number: %s\n' "$PR_URL" >&2
    exit 1
    ;;
esac

# `gh` accepts [HOST/]OWNER/REPO, and binding the host in once makes every
# later call land on the host the URL named. `--repo "$OWNER/$REPO"` resolves
# against whichever host gh considers default.
REPO_SPEC="$PR_HOST/$OWNER/$REPO"

printf '%s\n' "$PR_URL"       >"$RUN_DIR/pr-url"
printf '%s\n' "$PR_HOST"      >"$RUN_DIR/pr-host"
printf '%s\n' "$OWNER"        >"$RUN_DIR/owner"
printf '%s\n' "$REPO"         >"$RUN_DIR/repo"
printf '%s\n' "$NUMBER"       >"$RUN_DIR/number"
printf '%s\n' "$REPO_SPEC"    >"$RUN_DIR/repo-spec"
printf '%s\n' "$ENTRIES_FILE" >"$RUN_DIR/entries-file"
