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

# Measure the version against the MERGE-BASE (the fork point), not the live base
# tip — i.e. "did this branch move plugin.json's version relative to where it
# forked?" (#104). Comparing against the base tip mis-fires for a bump-less PR
# that is behind a version-bumped main: the tip has advanced, so the versions
# differ and a stale prefix gets stamped onto a PR that shipped no bump.
MERGE_BASE=$(git merge-base "$HEAD_SHA" "$BASE_SHA") \
  || die "could not compute merge-base of head and base"
# Fail loud locally rather than leaning on the downstream semver check: a
# successful merge-base that printed nothing would otherwise read an empty ref.
[ -n "$MERGE_BASE" ] || die "merge-base of head and base is empty"
BASE_V=$(read_version "$MERGE_BASE")
grep -qE "$SEMVER_RE" <<<"$BASE_V" \
  || die "merge-base plugin.json version is not 3-part semver: '$BASE_V'"

# Only stamp on a STRICT FORWARD bump over the fork point. A bump-less PR
# (HEAD_V == BASE_V) no-ops no matter how far the base has advanced; a branch
# that lowered the version (revert) no-ops too.
ver_gt() { # ver_gt A B -> true when A > B by semver order
  [ "$1" = "$2" ] && return 1
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n1)" = "$1" ]
}
if ! ver_gt "$HEAD_V" "$BASE_V"; then
  exit 0
fi

STRIPPED=$(sed -E 's/^v[0-9]+\.[0-9]+\.[0-9]+[[:space:]:]+//' <<<"$CURRENT_TITLE")
WANT="v${HEAD_V} ${STRIPPED}"
if [ "$WANT" = "$CURRENT_TITLE" ]; then
  exit 0
fi
printf '%s\n' "$WANT"
