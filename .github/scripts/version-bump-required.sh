#!/usr/bin/env bash
#
# version-bump-required.sh — enforce the runtime-vs-dev bump invariant (#120).
#
# The Team plugin's version / changelog / release exist for PLUGIN END USERS, so
# a version bump is warranted ONLY when a PR changes the DISTRIBUTED PLUGIN. This
# gate makes that mechanical, removing the judgment call that bumped #118 (a
# .github/-only CI fix) 0.13.1 -> 0.13.2:
#
#   runtime changed  +  bumped      -> OK    (the happy path)
#   runtime changed  +  no bump     -> FAIL  (a user-facing change must bump)
#   no runtime change +  bumped     -> FAIL  (a dev-only change must NOT bump)
#   no runtime change +  no bump    -> OK    (the dev-only land, e.g. #118)
#
# Exit 0 = invariant holds. Non-zero (+ ::error::) = violation.
#
# "Runtime" is the Runtime-vs-Development split in CLAUDE.md: the distributed
# plugin is agents/, skills/, hooks/, and .claude-plugin/ *content*. A change
# under .claude-plugin/ counts as runtime only when a non-version line changed —
# the bump itself edits the `"version"` field in plugin.json + marketplace.json,
# and that edit must not be mistaken for a content change (else every bump would
# self-justify).
#
# "Bumped" is measured against the MERGE-BASE (fork point), not the live base tip
# — "did THIS branch move plugin.json's version relative to where it forked?"
# (the #104 lesson, shared with pr-title-version.sh). A bump-less PR behind a
# version-bumped main therefore reads as "no bump", not a false positive.
#
# Inputs (env):
#   HEAD_SHA — the PR head commit (github.event.pull_request.head.sha)
#   BASE_SHA — the base branch commit (github.event.pull_request.base.sha)
#
# Reads .claude-plugin/plugin.json's version at the relevant commits via
# `git show`, so the repository must be checked out with enough history to
# resolve both SHAs and their merge-base.
#
# Requires: git, jq.

set -uo pipefail

SEMVER_RE='^[0-9]+\.[0-9]+\.[0-9]+$'
PLUGIN_JSON='.claude-plugin/plugin.json'

# Distributed-plugin directories whose ANY change is a runtime change.
RUNTIME_DIRS=(agents skills hooks)

die() { printf '::error::%s\n' "$1" >&2; exit 1; }

: "${HEAD_SHA:?HEAD_SHA required}"
: "${BASE_SHA:?BASE_SHA required}"

read_version() { # read_version <ref> -> version on stdout
  git show "$1:$PLUGIN_JSON" 2>/dev/null | jq -r '.version' 2>/dev/null
}

HEAD_V=$(read_version "$HEAD_SHA")
grep -qE "$SEMVER_RE" <<<"$HEAD_V" \
  || die "head plugin.json version is not 3-part semver: '$HEAD_V'"

MERGE_BASE=$(git merge-base "$HEAD_SHA" "$BASE_SHA") \
  || die "could not compute merge-base of head and base"
[ -n "$MERGE_BASE" ] || die "merge-base of head and base is empty"
BASE_V=$(read_version "$MERGE_BASE")
grep -qE "$SEMVER_RE" <<<"$BASE_V" \
  || die "merge-base plugin.json version is not 3-part semver: '$BASE_V'"

# Did THIS branch bump the version forward of its fork point? (strict forward).
ver_gt() { # ver_gt A B -> true when A > B by semver order
  [ "$1" = "$2" ] && return 1
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n1)" = "$1" ]
}
bumped=false
ver_gt "$HEAD_V" "$BASE_V" && bumped=true

# Did this branch change the distributed plugin?
changed_files=$(git diff --name-only "$MERGE_BASE" "$HEAD_SHA") \
  || die "could not diff merge-base..head"

runtime_changed=false
# agents/, skills/, hooks/ — any touched file is a runtime change.
if grep -qE "^($(IFS='|'; echo "${RUNTIME_DIRS[*]}"))/" <<<"$changed_files"; then
  runtime_changed=true
fi
# .claude-plugin/ — runtime only if a non-version line changed (a bare version
# edit is the bump, not content). Strip diff file headers (+++/---), keep added/
# removed lines, drop any line that touches the `"version"` field.
if ! $runtime_changed && grep -qE '^\.claude-plugin/' <<<"$changed_files"; then
  content=$(git diff "$MERGE_BASE" "$HEAD_SHA" -- .claude-plugin/ \
    | grep -E '^[+-]' \
    | grep -vE '^[+-]{3} ' \
    | grep -vE '"version"[[:space:]]*:' || true)
  [ -n "$content" ] && runtime_changed=true
fi

# Enforce the invariant.
if $runtime_changed && ! $bumped; then
  die "runtime files changed (distributed plugin) but the version was not bumped: $BASE_V -> $HEAD_V. Run version-bump."
fi
if ! $runtime_changed && $bumped; then
  die "version bumped ($BASE_V -> $HEAD_V) but no runtime files changed — a dev-only PR must land with no bump (see docs/versioning.md, #120)."
fi

printf 'OK: runtime_changed=%s bumped=%s (%s -> %s)\n' \
  "$runtime_changed" "$bumped" "$BASE_V" "$HEAD_V"
