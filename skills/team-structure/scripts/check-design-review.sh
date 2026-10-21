#!/usr/bin/env bash
#
# Check that an artifact directory's design passed review before STRUCTURE slices it.
#
#   usage: check-design-review.sh <artifact-dir>
#
#   <artifact-dir>  an existing docs/plans/<id>/ directory
#
# Reads the highest-numbered <artifact-dir>/design-review-<n>.md and the
# `verdict:` line of its YAML frontmatter. Prints one tab-separated line:
#
#   <result>\t<review>\t<verdict>
#
#   result   pass when the verdict is APPROVE or COMMENT, else fail
#   review   the highest-numbered review file's path, or - when none exists
#   verdict  the frontmatter verdict value, or - when the frontmatter is
#            missing or unclosed, or holds no verdict line
#
# Exit codes:
#
#   0  pass
#   1  fail: no review file, no readable verdict, or a non-passing verdict
#   2  usage fault: wrong argument count, or not a directory

set -u

if [ "$#" -ne 1 ]; then
  printf 'usage: %s <artifact-dir>\n' "$0" >&2
  exit 2
fi
if [ ! -d "$1" ]; then
  printf 'not a directory: %s\n' "$1" >&2
  exit 2
fi
dir="${1%/}"

review=""
review_number=-1
for candidate in "$dir"/design-review-*.md; do
  [ -f "$candidate" ] || continue
  number="$(basename "$candidate" .md)"
  number="${number#design-review-}"
  case "$number" in ''|*[!0-9]*) continue;; esac
  # Base 10 so a leading zero is not read as octal.
  if [ "$((10#$number))" -gt "$review_number" ]; then
    review_number="$((10#$number))"
    review="$candidate"
  fi
done

if [ -z "$review" ]; then
  printf 'fail\t-\t-\n'
  exit 1
fi

# The 60-line frontmatter bound matches discover-topic.sh, so an explicit path
# and a discovered one pass or fail on the same rule.
verdict="$(
  awk '
    NR == 1 { if (!/^---$/) exit 1; next }
    NR > 60 { exit 1 }
    /^---$/ { closed = 1; exit }
    /^verdict:/ && !found {
      sub(/^verdict:[[:space:]]*/, ""); sub(/[[:space:]]+$/, "")
      value = $0; found = 1
    }
    END { if (!closed) exit 1; print value }
  ' "$review"
)" || verdict=""

case "$verdict" in
  APPROVE|COMMENT)
    printf 'pass\t%s\t%s\n' "$review" "$verdict"
    exit 0
    ;;
esac
printf 'fail\t%s\t%s\n' "$review" "${verdict:--}"
exit 1
