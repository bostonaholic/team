#!/usr/bin/env bash
#
# pr-title-version.sh — decide the version-prefixed PR title for pr-title-sync.yml.
#
# Prints the desired PR title to stdout when the title should be rewritten, and
# NOTHING (exit 0) when the workflow should leave the title alone. The caller
# (`.github/workflows/pr-title-sync.yml`) runs `gh pr edit --title` only when this
# script prints a non-empty line.
#
# Inputs (env):
#   HEAD_SHA       — the PR head commit (github.event.pull_request.head.sha)
#   BASE_SHA       — the base branch commit (github.event.pull_request.base.sha)
#   CURRENT_TITLE  — the PR's current title (attacker-influenced; env-only)
#
# Reads `.claude-plugin/plugin.json`'s version at the relevant commits via
# `git show`, so the repository must be checked out with enough history to
# resolve both SHAs.
#
# Requires: git, jq.

set -uo pipefail

SEMVER_RE='^[0-9]+\.[0-9]+\.[0-9]+$'
PLUGIN_JSON='.claude-plugin/plugin.json'

die() { printf '::error::%s\n' "$1" >&2; exit 1; }

: "${HEAD_SHA:?HEAD_SHA required}"
: "${BASE_SHA:?BASE_SHA required}"
CURRENT_TITLE="${CURRENT_TITLE:-}"

read_version() { # read_version <ref> -> version on stdout
  git show "$1:$PLUGIN_JSON" 2>/dev/null | jq -r '.version' 2>/dev/null
}

HEAD_V=$(read_version "$HEAD_SHA")
grep -qE "$SEMVER_RE" <<<"$HEAD_V" \
  || die "head plugin.json version is not 3-part semver: '$HEAD_V'"

# The version this PR is measured against. (Current behavior — see #104: this
# reads the base BRANCH TIP, which disagrees with the checked-out merge ref when
# the PR is behind a version-bumped base, so a bump-less PR gets re-stamped.)
BASE_V=$(read_version "$BASE_SHA")
grep -qE "$SEMVER_RE" <<<"$BASE_V" \
  || die "base plugin.json version is not 3-part semver: '$BASE_V'"

# Stamp on ANY difference vs the base tip.
if [ "$HEAD_V" = "$BASE_V" ]; then
  exit 0
fi

STRIPPED=$(sed -E 's/^v[0-9]+\.[0-9]+\.[0-9]+[[:space:]:]+//' <<<"$CURRENT_TITLE")
WANT="v${HEAD_V} ${STRIPPED}"
if [ "$WANT" = "$CURRENT_TITLE" ]; then
  exit 0
fi
printf '%s\n' "$WANT"
