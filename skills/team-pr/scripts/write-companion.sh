#!/usr/bin/env bash
#
# Write one companion PR's body: the home run's `## Screenshots` section,
# spliced into that companion's own description and written once.
#
#   usage: write-companion.sh <companion-dir> <result-file>
#
#   <companion-dir>  a directory `resolve-pr.sh` already wrote for that
#                    companion's PR URL — the same split, the same charset
#                    tests, and the same host binding the home path uses
#   <result-file>    the `result.json` the home run wrote
#
# This is the home write run once per companion, so every guard the home write
# carries is here rather than restated somewhere it can drift out of step.
#
# Writes into <companion-dir>: `section.md`, `pre-image.md`, `new-body.md`.
#
# Exit codes:
#
#   0  the companion body was written
#   1  refused — the result carries no section, the splice refused, or another
#      writer landed first. That companion's body is byte-identical
#   2  fault — an unreadable or malformed input, or a failed `gh` call

set -euo pipefail

if [ "$#" -ne 2 ]; then
  printf 'usage: %s <companion-dir> <result-file>\n' "$0" >&2
  exit 2
fi
COMPANION_DIR="$1"
RESULT_FILE="$2"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SPLICE="$SCRIPT_DIR/../scripts/splice.mjs"

for REQUIRED in number repo-spec; do
  if [ ! -r "$COMPANION_DIR/$REQUIRED" ]; then
    printf 'companion directory has no %s — run resolve-pr.sh on its URL first\n' "$REQUIRED" >&2
    exit 2
  fi
done
if [ ! -r "$RESULT_FILE" ]; then
  printf 'result file is not readable: %s\n' "$RESULT_FILE" >&2
  exit 2
fi
NUMBER="$(cat "$COMPANION_DIR/number")"
REPO_SPEC="$(cat "$COMPANION_DIR/repo-spec")"

SECTION_FILE="$COMPANION_DIR/section.md"
BODY_FILE="$COMPANION_DIR/pre-image.md"
NEW_BODY_FILE="$COMPANION_DIR/new-body.md"
rm -f "$NEW_BODY_FILE" "$NEW_BODY_FILE.tmp"

# A file that does not parse is a fault, and it is tested first: the section
# read below cannot tell a parse failure from a null section, and reporting one
# as the other sends the operator hunting a missing field in a file jq never
# read.
if ! jq empty "$RESULT_FILE" 2>/dev/null; then
  printf 'the result file is not valid JSON\n' >&2
  exit 2
fi

# `jq -r` moves the section into the file `--section-file` reads; nothing
# re-types it, because the string carries the normalization's `\[`, `\<`, and
# `\!` escapes (external-data rules). `select` refuses a null or
# empty section rather than writing the four bytes `null` into a body: null
# means no write landed a verified URL, so the degraded note stands.
if ! jq -e -r '.section | select(type == "string" and length > 0)' "$RESULT_FILE" >"$SECTION_FILE"; then
  printf 'the result carries no section to copy\n' >&2
  exit 1
fi
# The file parses, so what fails here is the shape: `.assets` that is not an
# array is a jq runtime error, never a parse error.
LANDED_COUNT="$(jq '[.assets[] | select(.url != null)] | length' "$RESULT_FILE")" || {
  printf 'the result file has no readable assets list\n' >&2
  exit 2
}

# Guarded the way the home read is: a bare read binds "" on a rate limit, ""
# is indistinguishable from an empty description, and the splice then returns
# the section as that companion's WHOLE body.
if ! PRE_JSON="$(gh pr view "$NUMBER" --repo "$REPO_SPEC" --json body </dev/null)"; then
  printf 'could not read the companion body\n' >&2
  exit 2
fi
if ! printf '%s' "$PRE_JSON" | jq -e 'has("body") and (.body | type == "string")' >/dev/null; then
  printf 'the companion body response carried no body field\n' >&2
  exit 2
fi
# Guarded like the read above it. Unguarded, the pipeline's status is
# discarded and a jq failure exits with jq's own 5 — outside the 0/1/2 set this
# script declares and its callers map. The redirect keeps the bytes jq emits,
# so the file is not reshaped by a command substitution.
if ! printf '%s' "$PRE_JSON" | jq -r '.body | gsub("\r";"")' >"$BODY_FILE"; then
  printf 'could not normalize the companion body\n' >&2
  exit 2
fi

# Promoted only on success. A plain `> "$NEW_BODY_FILE"` truncates before the
# command runs, so a refusal — which prints nothing — leaves a zero-byte file
# for the write below to hand `--body-file`, blanking that companion's body.
if node "$SPLICE" --body-file "$BODY_FILE" --section-file "$SECTION_FILE" \
     --landed "$LANDED_COUNT" >"$NEW_BODY_FILE.tmp"; then
  mv "$NEW_BODY_FILE.tmp" "$NEW_BODY_FILE"
else
  STATUS=$?
  rm -f "$NEW_BODY_FILE.tmp" "$NEW_BODY_FILE"
  # Exit 1 prints `unchanged: <reason>` and exit 2 prints `scripts/splice.mjs:
  # <message>` — a refusal and a fault respectively. Report either and leave
  # that companion alone.
  exit "$STATUS"
fi

# The splice was computed from the body read above, so a companion somebody
# edited in between would have that edit overwritten by a body which never
# contained it — the same lost update the home path guards.
if ! NOW_JSON="$(gh pr view "$NUMBER" --repo "$REPO_SPEC" --json body </dev/null)"; then
  printf 'could not re-read the companion body\n' >&2
  exit 2
fi
if ! printf '%s' "$NOW_JSON" | jq -e 'has("body") and (.body | type == "string")' >/dev/null; then
  printf 'the companion body response carried no body field\n' >&2
  exit 2
fi
# Bound before it is compared: inside `[ … ]` the substitution's status is
# discarded and `set -e` cannot reach it, so a jq failure binds "" — which
# equals a companion whose description is empty, passes the guard vacuously,
# and writes over the update it exists to catch.
if ! NOW_BODY="$(printf '%s' "$NOW_JSON" | jq -r '.body | gsub("\r";"")')"; then
  printf 'could not normalize the companion body\n' >&2
  exit 2
fi
# Both sides lose their trailing newlines to command substitution, so a
# concurrent append of nothing but whitespace compares equal and the write
# lands. Accepted: the only update lost is trailing whitespace GitHub itself
# normalizes and no reader can see.
if [ "$NOW_BODY" != "$(cat "$BODY_FILE")" ]; then
  rm -f "$NEW_BODY_FILE"
  printf 'another writer landed first — this companion is untouched\n' >&2
  exit 1
fi
# Guarded like every other `gh` call here: unguarded, `set -e` propagates gh's
# own status, and a 1 reads to the caller as "another writer landed first" —
# the one outcome this arm is not.
if ! gh pr edit "$NUMBER" --repo "$REPO_SPEC" --body-file "$NEW_BODY_FILE" </dev/null; then
  printf 'could not write the companion body\n' >&2
  exit 2
fi
