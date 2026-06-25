#!/usr/bin/env bash
#
# discover-topic.sh — three-tier artifact-directory discovery (archetype A).
#
# Single source of truth for the discovery logic the /team-* phase skills run to
# resolve their docs/plans/<id>/ working directory. Distributed with the plugin
# and invoked by the phase skills via
#   bash "${CLAUDE_PLUGIN_ROOT}/skills/qrspi-workflow/discover-topic.sh" <pred> [require_approved] [explicit_dir]
# (the same ${CLAUDE_PLUGIN_ROOT} convention the hooks and nested-agents helper
# use). It replaces the bash block that was previously duplicated, byte-for-byte,
# across eight skills.
#
# ID_RE + PHASE_FILES are kept in sync with the node hooks' findActiveTopic()
# (hooks/session-start-recover.mjs, hooks/pre-compact-anchor.mjs) by a drift
# tripwire in tests/discover-topic.test.ts. The behavior below is pinned by the
# L3 subprocess tests in that same file.
#
# Usage: discover-topic.sh <pred> [require_approved] [explicit_dir]
#   <pred>            predecessor artifact filename the calling skill consumes
#                     (e.g. questions.md, design.md)
#   require_approved  "1" => <pred> must carry `approved: true` in its
#                     frontmatter (team-structure's design gate); default: off
#   explicit_dir      tier-1 explicit directory ($ARGUMENTS); honored verbatim
#                     when it names an existing dir
#
# Prints the resolved docs/plans/<id>/ directory and exits 0, or prints nothing
# (tier 3 — the caller falls to AskUserQuestion). Scans docs/plans/ relative to
# the CURRENT working directory (the user's repo/worktree root); it never cd's.

set -u

PRED="${1:?usage: discover-topic.sh <pred> [require_approved] [explicit_dir]}"
REQUIRE_APPROVED="${2:-}"
EXPLICIT="${3:-}"

ID_RE='^([A-Za-z][A-Za-z0-9_]*-[0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2})-[a-z0-9][a-z0-9-]*$'
PHASE_FILES="task questions research design structure plan"

# Tier 1 — explicit: $ARGUMENTS names an existing dir → use verbatim.
if [ -n "$EXPLICIT" ] && [ -d "$EXPLICIT" ]; then
  echo "$EXPLICIT"
  exit 0
fi

# Tier 2 — discover: newest ID_RE dir under docs/plans/ that holds PRED
# (when require_approved is set, PRED must also be approved: true).
best=""
best_mtime=-1
for dir in docs/plans/*/; do
  [ -d "$dir" ] || continue                              # unexpanded glob / empty
  name="$(basename "$dir")"
  printf '%s' "$name" | grep -qE "$ID_RE" || continue    # ID_RE filter
  [ -f "$dir$PRED" ] || continue                         # predecessor filter
  if [ "$REQUIRE_APPROVED" = "1" ]; then
    grep -qE '^approved:[[:space:]]*true[[:space:]]*$' "$dir$PRED" || continue
  fi
  m=-1
  for p in $PHASE_FILES; do
    f="$dir$p.md"
    [ -f "$f" ] || continue                              # skip racing/absent
    s="$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null)" || continue
    [ "${s:-0}" -gt "$m" ] && m="$s"                     # max-mtime over PHASE_FILES
  done
  [ "$m" -gt "$best_mtime" ] && { best_mtime="$m"; best="$dir"; }
done
[ -n "$best" ] && { echo "$best"; exit 0; }

# Tier 3 — none found: print nothing → caller falls to AskUserQuestion.
exit 0
