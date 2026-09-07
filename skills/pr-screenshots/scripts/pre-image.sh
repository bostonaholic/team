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

# The read is GUARDED, and the guard is not decoration. An unguarded
# assignment binds "" on any transient gh failure — a rate limit, a network
# blip, an expired token — and "" is indistinguishable from a genuinely empty
# description. Downstream, nothing tells them apart: the pre-image check finds
# no heading and allows the write, the splice returns the Screenshots section
# as the WHOLE body, and the lost-update guard passes vacuously because every
# string starts with "". The run then replaces the entire description of a PR
# that may already be merged.
if ! PRE_IMAGE_JSON="$(gh pr view "$NUMBER" --repo "$REPO_SPEC" --json body </dev/null)"; then
  printf 'could not read the PR body\n' >&2
  exit 2
fi
# The envelope is what distinguishes the two cases: a failed call yields no
# JSON object at all, while a PR with no description yields `{"body":""}` and
# is a legitimate empty pre-image the run may write into.
if ! printf '%s' "$PRE_IMAGE_JSON" | jq -e 'has("body") and (.body | type == "string")' >/dev/null; then
  printf 'the PR body response carried no body field\n' >&2
  exit 2
fi
# `gsub("\r";"")` IS the CRLF normalization, and the same `gsub` runs on every
# later read of the body: normalizing one side alone makes the lost-update
# guard compare a normalized pre-image against an unnormalized re-read and
# refuse every run on a PR whose body carries CRLFs.
#
# The strip happens INSIDE `jq`, so `jq` is the command whose status is
# observed. Piping into `tr` put `tr` last, and a `jq` failure was masked by
# `tr` exiting 0 — binding an empty pre-image, which is exactly the
# indistinguishable-from-empty state above.
if ! PRE_IMAGE="$(printf '%s' "$PRE_IMAGE_JSON" | jq -r '.body | gsub("\r";"")')"; then
  printf 'could not normalize the PR body\n' >&2
  exit 2
fi

# The pre-image reaches every check as a FILE. A path nothing ever wrote is an
# EMPTY file: `--check` then passes vacuously — an empty body has no heading
# and no fault — and the splice writes the Screenshots section over the PR's
# whole description.
printf '%s' "$PRE_IMAGE" >"$RUN_DIR/pre-image.md"
printf '%s' "$PRE_IMAGE" >"$RUN_DIR/after.md"
: >"$RUN_DIR/assets.tsv"
: >"$RUN_DIR/failures.tsv"
rm -f "$RUN_DIR/read-failed"
