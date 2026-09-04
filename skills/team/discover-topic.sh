#!/usr/bin/env bash

set -u

explicit_path="${1:-}"
predecessor="${2:-}"
review_requirement="${3:-}"

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  printf 'usage: %s explicit-path predecessor [--require-passing-review]\n' "$0" >&2
  exit 2
fi
if [ "$#" -eq 3 ] && [ "$review_requirement" != "--require-passing-review" ]; then
  printf 'unknown option: %s\n' "$review_requirement" >&2
  exit 2
fi

# Explicit existing directories win verbatim, including review-gated callers.
if [ -n "$explicit_path" ] && [ -d "$explicit_path" ]; then
  printf '%s\n' "$explicit_path"
  exit 0
fi

ID_RE='^([A-Za-z][A-Za-z0-9_]*-[0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2})-[a-z0-9][a-z0-9-]*$'
PHASE_FILES="1-task 2-questions 5-research 6-design 7-structure 8-plan"
best=""
best_mtime=-1

for dir in docs/plans/*/; do
  name="$(basename "$dir")"
  printf '%s' "$name" | grep -qE "$ID_RE" || continue
  [ -f "$dir$predecessor" ] || continue

  if [ "$review_requirement" = "--require-passing-review" ]; then
    review=""
    review_number=-1
    for candidate in "$dir"design-review-*.md; do
      [ -f "$candidate" ] || continue
      number="$(basename "$candidate" .md)"
      number="${number#design-review-}"
      case "$number" in ''|*[!0-9]*) continue;; esac
      [ "$number" -gt "$review_number" ] && {
        review_number="$number"
        review="$candidate"
      }
    done
    [ -n "$review" ] || continue
    frontmatter="$(
      awk '
        NR == 1 { if (!/^---$/) exit 1; next }
        NR > 60 { exit 1 }
        /^---$/ { closed = 1; exit }
        { print }
        END { if (!closed) exit 1 }
      ' "$review"
    )" || continue
    printf '%s\n' "$frontmatter" \
      | grep -qE '^verdict:[[:space:]]*(APPROVE|COMMENT)[[:space:]]*$' || continue
  fi

  mtime=-1
  for phase in $PHASE_FILES; do
    file="$dir$phase.md"
    [ -f "$file" ] || continue
    seconds="$(stat -f %m "$file" 2>/dev/null || stat -c %Y "$file" 2>/dev/null)" || continue
    [ "${seconds:-0}" -gt "$mtime" ] && mtime="$seconds"
  done
  [ "$mtime" -gt "$best_mtime" ] && {
    best_mtime="$mtime"
    best="$dir"
  }
done

[ -n "$best" ] && printf '%s\n' "$best"
exit 0
