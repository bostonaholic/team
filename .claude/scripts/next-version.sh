#!/usr/bin/env bash
#
# next-version.sh — print the next free plugin version for a PR.
#
# Single responsibility: <major|minor|patch> -> next version not claimed by
# origin/main or any other open PR, printed to stdout (and nothing else, so it
# pipes cleanly). See docs/versioning.md for the per-PR versioning policy.
#
# Collision scan is FAIL-OPEN: if the GitHub API is unreachable, the candidate
# computed from origin/main is printed with a warning on stderr — the CI
# version gate is the authoritative collision check.
#
# Dev-only, non-distributed (lives under .claude/, not hooks/) per the
# runtime-vs-development split in CLAUDE.md / AGENTS.md.
#
# Usage:
#   .claude/scripts/next-version.sh <major|minor|patch>
#
# Requires: git, jq; gh (authenticated) for the collision scan.

set -uo pipefail

REPO="bostonaholic/team"
SEMVER_RE='^[0-9]+\.[0-9]+\.[0-9]+$'

die() { printf 'error: %s\n' "$1" >&2; exit 1; }
warn() { printf 'warning: %s\n' "$1" >&2; }

[ "$#" -eq 1 ] || die "usage: $(basename "$0") <major|minor|patch>"
level="$1"
case "$level" in
  major|minor|patch) ;;
  *) die "level must be major, minor, or patch: '$level'" ;;
esac

command -v git >/dev/null 2>&1 || die "git not found"
command -v jq >/dev/null 2>&1 || die "jq not found"

git fetch origin main --quiet 2>/dev/null || warn "git fetch failed — using local origin/main"
base="$(git show origin/main:.claude-plugin/plugin.json 2>/dev/null | jq -r .version)" \
  || die "could not read version from origin/main:.claude-plugin/plugin.json"
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

candidate="$(bump "$base" "$level")"

# Collision scan: collect versions claimed by other open PRs (fail-open).
claimed=""
if command -v gh >/dev/null 2>&1; then
  prs="$(gh api "repos/$REPO/pulls?state=open&per_page=100" \
    --jq '.[] | "\(.head.repo.full_name) \(.head.sha)"' 2>/dev/null)"
  if [ $? -ne 0 ]; then
    warn "could not list open PRs — skipping collision scan"
  else
    while read -r head_repo head_sha; do
      [ -n "$head_repo" ] || continue
      v="$(gh api -H "Accept: application/vnd.github.raw+json" \
        "repos/$head_repo/contents/.claude-plugin/plugin.json?ref=$head_sha" 2>/dev/null \
        | jq -r .version 2>/dev/null)"
      printf '%s' "$v" | grep -qE "$SEMVER_RE" && claimed="$claimed $v"
    done <<EOF
$prs
EOF
  fi
else
  warn "gh CLI not found — skipping collision scan"
fi

is_claimed() {
  case " $claimed " in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

while is_claimed "$candidate"; do
  warn "v$candidate is claimed by an open PR — walking forward"
  candidate="$(bump "$candidate" "$level")"
done

printf '%s\n' "$candidate"
