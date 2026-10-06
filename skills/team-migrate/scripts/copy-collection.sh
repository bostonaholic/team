#!/bin/bash
#
# Copy every skill the bostonaholic/skills collection lists at a release tag
# into the global skill directory of each named directory-only harness.
#
#   usage: copy-collection.sh <tag> <harness>...
#
# <harness> is antigravity, opencode, or cursor. A skill already there as a
# directory with its SKILL.md stays as it is. Anything else in its place stops
# the run: migrate.sh moves it to a `-retired` sibling first. Each copy is
# staged beside the skill directory and moved into place whole, so an
# interrupted run never leaves a partial skill. Nothing goes into
# ~/.agents/skills: Codex reads that directory too, so a copy there doubles
# the collection plugin. migrate.sh runs this as one planned step, and under
# DRY_RUN=true prints the command instead.
#
# Output: one `copied` line per skill it adds, then one
# `<harness>: <n> copied, <n> kept` line per harness.
#
# Exit codes:
#   0  every harness holds every skill
#   1  the clone or a copy failed, or something stands where a copy goes
#   2  usage fault

set -euo pipefail
export LC_ALL=C

# shellcheck source=lib.sh
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

usage() {
  printf 'usage: %s <tag> <harness>...\n' "$0" >&2
  exit 2
}

[ "$#" -ge 2 ] || usage
TAG="$1"
shift
printf '%s\n' "$TAG" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+$' || usage
for harness in "$@"; do
  in_list "$harness" "$DIR_HARNESS_SET" || usage
done

SOURCE="$(mktemp -d "${TMPDIR:-/tmp}/team-migrate.XXXXXX")"
STAGING=""
trap 'rm -rf "${SOURCE:?}" ${STAGING:+"$STAGING"}' EXIT
git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$TAG" "$SKILLS_URL" "$SOURCE/skills"
PATHS="$(node "$LISTING" collection-skills < "$SOURCE/skills/.claude-plugin/plugin.json")"
[ -n "$PATHS" ] || die "the collection lists no skills at $TAG"
ROOT="$(real_dir "$SOURCE/skills")"
# Each listed skill must be a real directory inside the clone, not a link out.
while IFS= read -r path; do
  case "$(real_dir "$SOURCE/skills/$path")" in
    "$ROOT"/*) [ ! -L "$SOURCE/skills/$path" ] || die "the collection's $path is a link" ;;
    *) die "the collection's $path is not a directory inside its clone" ;;
  esac
done <<< "$PATHS"

for harness in "$@"; do
  dest="$(npx_dir "$harness")"
  copied=0 kept=0
  mkdir -p "$dest"
  while IFS= read -r path; do
    name="${path##*/}"
    target="$dest/$name"
    if skill_copied "$dest" "$name"; then
      kept=$((kept + 1))
      continue
    fi
    if present "$target"; then die "$target is in the way; move it aside, then run again"; fi
    # Staged beside the skill directory, not in it, where no harness scans.
    STAGING="$(mktemp -d "$(dirname "$dest")/.team-migrate.XXXXXX")"
    cp -R "$SOURCE/skills/$path" "$STAGING/$name"
    mv -n "$STAGING/$name" "$target"
    rmdir "$STAGING" && STAGING=""
    skill_copied "$dest" "$name" || die "$target did not land as a copy"
    printf 'copied %s\n' "$target"
    copied=$((copied + 1))
  done <<< "$PATHS"
  printf '%s: %d copied, %d kept\n' "$harness" "$copied" "$kept"
done
