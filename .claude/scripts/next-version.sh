#!/usr/bin/env bash
#
# next-version.sh — print the next plugin version for a land-time bump.
#
# Single responsibility: <major|minor|patch> -> bump(base, level), printed to
# stdout and nothing else (so it pipes cleanly).
#
# DETERMINISTIC: the output is a pure function of (base version, level). The
# base is read from the remote's default branch — resolved via origin/HEAD, so
# main/master/whatever all work, never hardcoded — or taken verbatim from
# $BASE_VERSION when set (used by tests, and by callers that already know the
# base they intend to land onto).
#
# Under the land-time versioning model (docs/versioning.md) the version is
# assigned at land time against current `main`, and landing is SERIALIZED — one
# PR is versioned-and-merged at a time. So bump(main, level) is always free and
# there is intentionally NO open-PR collision scan. A concurrent race is handled
# by shipit (rebase onto new main + recompute the bump) and backstopped by
# release-on-merge.yml's duplicate-tag rejection.
#
# NOTE: earlier revisions walked past versions "claimed" by other open PRs via
# the GitHub API. That was the per-PR model's mechanism. It is deliberately
# removed: it made the output depend on whatever PRs happened to be open, which
# (a) was non-deterministic and untestable, and (b) skipped perfectly free
# versions when a stale PR statically claimed one (e.g. 0.5.1 -> 0.7.0, skipping
# 0.6.0). Do not reintroduce it — tests/next-version.test.ts locks it out.
#
# Dev-only, non-distributed (lives under .claude/, not hooks/) per the
# runtime-vs-development split in CLAUDE.md / AGENTS.md.
#
# Usage:
#   .claude/scripts/next-version.sh <major|minor|patch>
#   BASE_VERSION=1.2.3 .claude/scripts/next-version.sh minor   # -> 1.3.0
#
# Requires: git, jq (only when $BASE_VERSION is unset).

set -uo pipefail

SEMVER_RE='^[0-9]+\.[0-9]+\.[0-9]+$'

die() { printf 'error: %s\n' "$1" >&2; exit 1; }
warn() { printf 'warning: %s\n' "$1" >&2; }

[ "$#" -eq 1 ] || die "usage: $(basename "$0") <major|minor|patch>"
level="$1"
case "$level" in
  major|minor|patch) ;;
  *) die "level must be major, minor, or patch: '$level'" ;;
esac

# Base version: $BASE_VERSION override (deterministic / testable), else read it
# from the remote's default branch — resolved via origin/HEAD, never hardcoded.
if [ -n "${BASE_VERSION:-}" ]; then
  base="$BASE_VERSION"
else
  command -v git >/dev/null 2>&1 || die "git not found"
  command -v jq >/dev/null 2>&1 || die "jq not found"
  # Resolve the remote's default branch (main, master, or whatever it is).
  default_branch="$(git symbolic-ref --quiet refs/remotes/origin/HEAD 2>/dev/null \
    | sed 's@^refs/remotes/origin/@@')"
  [ -n "$default_branch" ] || default_branch="main"
  git fetch origin "$default_branch" --quiet 2>/dev/null \
    || warn "git fetch failed — using local origin/$default_branch"
  base="$(git show "origin/$default_branch:.claude-plugin/plugin.json" 2>/dev/null | jq -r .version)" \
    || die "could not read version from origin/$default_branch:.claude-plugin/plugin.json"
fi
printf '%s' "$base" | grep -qE "$SEMVER_RE" || die "base version is not 3-part semver: '$base'"

bump() { # bump <version> <level> -> next version
  local v="$1" l="$2" maj min pat
  IFS=. read -r maj min pat <<EOF
$v
EOF
  case "$l" in
    major) printf '%d.0.0' "$((maj + 1))" ;;
    minor) printf '%d.%d.0' "$maj" "$((min + 1))" ;;
    patch) printf '%d.%d.%d' "$maj" "$min" "$((pat + 1))" ;;
  esac
}

printf '%s\n' "$(bump "$base" "$level")"
