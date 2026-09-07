#!/usr/bin/env bash
#
# Take the pre-image: the PR body as it stood before the first attach.
#
#   usage: pre-image.sh <run-dir>
#
# <run-dir> is the directory `resolve-pr.sh` already wrote. This reads
# `number` and `repo-spec` out of it and writes:
#
#   pre-image.md   the body, CRLF-normalized — the input to the splice, the
#                  baseline for the lost-update guard, and the file every
#                  pre-attach check reads
#   after.md       the body as of the last read, which is the pre-image until
#                  `upload.sh` re-reads it. Bound HERE as well, because the
#                  capability gap skips `upload.sh` entirely and the guard
#                  still has to have a baseline to compare
#   assets.tsv     truncated: one line per landed entry, and none has landed
#   failures.tsv   truncated: one line per failed entry
#
# Exit codes:
#
#   0  the pre-image is on disk
#   2  fault — the read failed, or the run directory is not one. Nothing has
#      been decided, so this is not a refusal

set -euo pipefail

if [ "$#" -ne 1 ]; then
  printf 'usage: %s <run-dir>\n' "$0" >&2
  exit 2
fi
RUN_DIR="$1"
for REQUIRED in number repo-spec; do
  if [ ! -r "$RUN_DIR/$REQUIRED" ]; then
    printf 'run directory has no %s — run resolve-pr.sh first\n' "$REQUIRED" >&2
    exit 2
  fi
done
NUMBER="$(cat "$RUN_DIR/number")"
REPO_SPEC="$(cat "$RUN_DIR/repo-spec")"

# Guarded: an unguarded read binds "" on any transient gh failure, and ""
# is indistinguishable from a genuinely empty description — after which the
# splice returns the section as the WHOLE body of a PR that may be merged.
if ! PRE_IMAGE_JSON="$(gh pr view "$NUMBER" --repo "$REPO_SPEC" --json body </dev/null)"; then
  printf 'could not read the PR body\n' >&2
  exit 2
fi
# The envelope separates the two: a failed call yields no JSON object, while
# a PR with no description yields `{"body":""}` and is legitimately empty.
if ! printf '%s' "$PRE_IMAGE_JSON" | jq -e 'has("body") and (.body | type == "string")' >/dev/null; then
  printf 'the PR body response carried no body field\n' >&2
  exit 2
fi
# The CRLF normalization, which every later read of the body repeats:
# normalizing one side alone makes the lost-update guard refuse every run on
# a PR whose body carries CRLFs. It happens INSIDE `jq` so the status
# observed is jq's own — piping into `tr` masked a jq failure as success.
if ! PRE_IMAGE="$(printf '%s' "$PRE_IMAGE_JSON" | jq -r '.body | gsub("\r";"")')"; then
  printf 'could not normalize the PR body\n' >&2
  exit 2
fi

# The pre-image reaches every check as a FILE, and a path nothing wrote is an
# EMPTY one: `--check` passes vacuously on it and the splice then writes the
# section over the PR's whole description.
printf '%s' "$PRE_IMAGE" >"$RUN_DIR/pre-image.md"
printf '%s' "$PRE_IMAGE" >"$RUN_DIR/after.md"
: >"$RUN_DIR/assets.tsv"
: >"$RUN_DIR/failures.tsv"
rm -f "$RUN_DIR/read-failed"
