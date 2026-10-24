#!/usr/bin/env bash
#
# Resolve the artifact directory a /team-* command works in.
#
#   usage: discover-topic.sh explicit-path predecessor [--require-passing-review]
#
# Run it from the repository root. An existing explicit-path directory wins
# verbatim. Otherwise prints the docs/plans/<id>/ directory whose name
# scripts/plan-id.sh --parse accepts, which holds <predecessor>, and whose
# newest phase artifact is most recent. --require-passing-review also requires
# scripts/design-review-status.sh to report passed. Prints nothing when no
# directory qualifies.
#
# Exit codes:
#   0  printed a path, or nothing when no directory qualifies
#   1  a sibling script under scripts/ is missing
#   2  usage fault

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

scripts="$(dirname "${BASH_SOURCE[0]}")/scripts"
for helper in plan-id.sh design-review-status.sh; do
  if [ ! -x "$scripts/$helper" ]; then
    printf 'missing helper: %s\n' "$scripts/$helper" >&2
    exit 1
  fi
done

PHASE_FILES="1-task 2-questions 5-research 6-design 7-structure 8-plan"
best=""
best_mtime=-1

for dir in docs/plans/*/; do
  name="$(basename "$dir")"
  # The file test first spares a helper process per directory that cannot qualify.
  [ -f "$dir$predecessor" ] || continue
  "$scripts/plan-id.sh" --parse "$name" >/dev/null || continue

  if [ "$review_requirement" = "--require-passing-review" ]; then
    "$scripts/design-review-status.sh" "$dir" >/dev/null || continue
  fi

  mtime=-1
  for phase in $PHASE_FILES; do
    file="$dir$phase.md"
    [ -f "$file" ] || continue
    # GNU first: GNU `stat -f` is filesystem mode and exits 0 with no mtime.
    seconds="$(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file" 2>/dev/null)" || continue
    [ "${seconds:-0}" -gt "$mtime" ] && mtime="$seconds"
  done
  [ "$mtime" -gt "$best_mtime" ] && {
    best_mtime="$mtime"
    best="$dir"
  }
done

[ -n "$best" ] && printf '%s\n' "$best"
exit 0
