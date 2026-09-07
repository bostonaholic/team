#!/usr/bin/env bash
#
# Attach one file per command, harvest the URL each attach resolved, and prove
# the body is still the one the pre-image was taken from.
#
#   usage: upload.sh <run-dir>
#
# <run-dir> is the directory `resolve-pr.sh` and `pre-image.sh` already wrote.
# This reads `pr-host`, `number`, `repo-spec`, `entries-file`, and
# `pre-image.md` out of it, and writes:
#
#   assets.tsv       one line per landed entry: <url> TAB <path>
#   failures.tsv     one line per failed entry: <reason> TAB <path>
#   after.md         the body as of the last successful read
#   read-failed      written only when some re-read failed
#   entry-paths.txt  the JSON-to-shell bridge: one entry path per line
#   candidates.txt   the URLs one attach's suffix held, rewritten per entry
#
# EVERY entry lands in exactly one of the two files. An entry in neither
# vanishes: `--landed` is the line count of assets.tsv, so a harvest that
# stopped matching would write the degraded "captured, not yet uploaded" over
# assets that are live on public URLs, beside an empty failure list.
#
# Exit codes:
#
#   0  the attach loop ran and the baseline still holds. A run where every
#      entry failed exits 0 too: that is `degraded`, and failures.tsv says so
#   1  refused before the first attach — the entries file, or the root it
#      declares. Nothing was attached and nothing was written
#   2  fault — the run directory is missing a file `pre-image.sh` writes
#   4  lost update: another writer changed the body during the upload window,
#      or a re-read failed and the baseline cannot be proved current. Assets
#      may be live, so the caller reports `uploaded-not-written` and writes
#      no body

set -euo pipefail

if [ "$#" -ne 1 ]; then
  printf 'usage: %s <run-dir>\n' "$0" >&2
  exit 2
fi
RUN_DIR="$1"
for REQUIRED in pr-host number repo-spec entries-file pre-image.md; do
  if [ ! -r "$RUN_DIR/$REQUIRED" ]; then
    printf 'run directory has no %s — run resolve-pr.sh and pre-image.sh first\n' "$REQUIRED" >&2
    exit 2
  fi
done

# Read, never re-derived from `pr-url`: `resolve-pr.sh` already split and
# charset-tested the resolved URL, and `pr-host` is the value the attachment
# allowlist below is documented to come from
# (`references/01-input-and-result.md`).
PR_HOST="$(cat "$RUN_DIR/pr-host")"
NUMBER="$(cat "$RUN_DIR/number")"
REPO_SPEC="$(cat "$RUN_DIR/repo-spec")"
ENTRIES_FILE="$(cat "$RUN_DIR/entries-file")"
ASSETS_FILE="$RUN_DIR/assets.tsv"
FAILURES_FILE="$RUN_DIR/failures.tsv"
CANDIDATES_FILE="$RUN_DIR/candidates.txt"
: >"$ASSETS_FILE"
: >"$FAILURES_FILE"
# A previous attempt's marker is this attempt's stale verdict: `pre-image.sh`
# clears it, and `upload.sh` runs again against the same directory without it.
rm -f "$RUN_DIR/read-failed"

# Read the pre-image byte-exactly: `$(cat …)` strips trailing newlines, and the
# empty-pre-image arm of the guard below turns on whether the body was empty.
PRE_IMAGE="$(cat "$RUN_DIR/pre-image.md"; printf x)"
PRE_IMAGE="${PRE_IMAGE%x}"

refuse() {
  printf '%s\n' "$1" >&2
  exit 1
}

# --- The entries file, and the root it declares -----------------------------
#
# Validated and used in the same process: `cd ""` succeeds as a no-op, so an
# unbound root silently becomes the working directory — after which an entry
# naming <repo>/.env is "contained".

if [ -z "$ENTRIES_FILE" ]; then
  refuse 'the run must name the entries JSON'
fi
if [ ! -r "$ENTRIES_FILE" ]; then
  refuse "entries file is not readable: $ENTRIES_FILE"
fi
CAPTURE_ROOT="$(jq -r '.root // empty' "$ENTRIES_FILE")" || refuse 'the entries file is not valid JSON'
if [ -z "$CAPTURE_ROOT" ]; then
  refuse 'the entries file must declare an absolute root'
fi
case "$CAPTURE_ROOT" in
  /*) : ;;
  *)  refuse "the declared root is not absolute: $CAPTURE_ROOT" ;;
esac
CAPTURE_ROOT="$(cd -- "$CAPTURE_ROOT" && pwd -P)" || refuse "the declared root does not resolve: $CAPTURE_ROOT"

# The JSON-to-shell bridge reads one path per line, so a path holding a
# newline would arrive as two and the `newline in path` check could never
# fire on it. The counts differ exactly then, and that refuses the whole run.
ENTRY_COUNT="$(jq '.entries | length' "$ENTRIES_FILE")" || refuse 'the entries file is not valid JSON'
PATHS_FILE="$RUN_DIR/entry-paths.txt"
jq -r '.entries[].path' "$ENTRIES_FILE" >"$PATHS_FILE" || refuse 'the entries file is not valid JSON'
LINE_COUNT="$(wc -l <"$PATHS_FILE" | tr -d '[:space:]')"
if [ "$ENTRY_COUNT" != "$LINE_COUNT" ]; then
  refuse 'a path holds a newline'
fi

# --- Per-entry state --------------------------------------------------------

AFTER="$PRE_IMAGE"        # the body as of the last successful read
READ_FAILED=no            # no re-read has failed yet
NEWLINE='
'
case "$PR_HOST" in
  github.com) ASSET_PROXY_HOST="private-user-images.githubusercontent.com" ;;
  *)          ASSET_PROXY_HOST="private-user-images.$PR_HOST" ;;   # the Enterprise equivalent
esac

REASON=""
ENTRY_PATH=""
ASSET_URL=""

# Records the entry's failure class for the report.
fail_entry() {
  # A failed re-read leaves $AFTER at the last SUCCESSFUL value, so every entry
  # after it — and the guard below — would test a stale baseline. Marked here,
  # once, in the one place every failure class passes through.
  if [ "$REASON" = "body read failed" ]; then
    READ_FAILED=yes
  fi
  printf '%s\t%s\n' "$REASON" "$ENTRY_PATH" >>"$FAILURES_FILE"
}

# Bind $ASSET_URL to the one attachment URL "$1" holds, or clear it and set
# $REASON. Only an URL on the attachment origin qualifies: allowlisted host,
# path anchored at the host boundary. Any absolute URL would be too wide — a
# party with write access can append their own during the attach window and
# have it harvested, embedded, and copied into every companion PR.
harvest() {
  local suffix="$1" candidate rest host path file
  ASSET_URL=""
  printf '%s' "$suffix" | grep -Eo 'https://[^][:space:]<>")]+' >"$CANDIDATES_FILE" || true
  while IFS= read -r candidate; do
    case "$candidate" in https://*) : ;; *) continue ;; esac
    rest="${candidate#https://}"
    host="${rest%%/*}"
    case "$rest" in
      */*) path="/${rest#*/}" ;;
      *)   path="/" ;;
    esac
    # A host is a whole label, never a substring: userinfo makes
    # `github.com@attacker.example` the host, and a substring test ours.
    case "$host" in
      ""|*[!A-Za-z0-9.-]*) continue ;;   # empty, or carrying userinfo, a port, or worse
    esac
    # Dot segments walk out of the anchor below, so this runs BEFORE it: an
    # HTTP client normalizes `…/assets/../../attacker/evil/x.png` to content
    # the attacker controls on an allowlisted host. Their percent-encoded
    # forms are refused rather than decoded.
    case "$path" in *..|*../*) continue ;; esac
    case "$candidate" in *%2[eEfF]*) continue ;; esac
    file="${path%%\?*}"                  # the path with its query string removed
    case "$path" in
      /user-attachments/assets/*) : ;;   # github.com and GitHub Enterprise
      *)                                 # the private-repo proxy rewrite, on its own host
        case "$host" in "$ASSET_PROXY_HOST") : ;; *) continue ;; esac
        # `*.githubusercontent.com` is not one host: raw.githubusercontent.com
        # serves any public repository's content. One enumerated host, and one
        # shape — one or two segments, the last naming an image file, because
        # the rewrite GitHub emits is /<user-id>/<asset-id>-<uuid>.png?jwt=…
        case "${file#/}" in
          */*/*) continue ;;
          *.png|*.jpg|*.jpeg|*.gif|*.webp|*.avif) : ;;
          *) continue ;;
        esac ;;
    esac
    case "$host" in
      "$PR_HOST"|"$ASSET_PROXY_HOST"|"${PR_SCREENSHOTS_ASSET_HOST:-$PR_HOST}") : ;;
      *) continue ;;
    esac
    # More than one allowlisted candidate is a failure, never a guess: it
    # fires exactly when another writer appended a URL during the window.
    if [ -n "$ASSET_URL" ]; then
      ASSET_URL=""
      REASON="ambiguous attachment URL"
      break
    fi
    ASSET_URL="$candidate"
  done <"$CANDIDATES_FILE"
}

# --- One entry per iteration: validate, attach, re-read, harvest, record ----
#
# The check set is exhaustive, and each check names its own failure class:
# `Not uploaded: <caption> — <reason>` is the whole account the operator gets.

while IFS= read -r ENTRY_PATH; do
  REASON=""
  case "$ENTRY_PATH" in
    *"$NEWLINE"*) REASON="newline in path" ; fail_entry ; continue ;;
    # The host reads `#` in an attach argument as the alt-text delimiter, so a
    # path ending `login.png#after.png` uploads a different file under an alt
    # the caller never chose.
    *"#"*)        REASON="# in path"       ; fail_entry ; continue ;;
    /*)           : ;;
    *)            REASON="relative path"   ; fail_entry ; continue ;;
  esac
  # `[ -L ]` runs BEFORE `[ -e ]`, which follows the link: a dangling symlink
  # tested first reports as `file missing` and hides the attempt. `-f` follows
  # links too, so it alone accepts a link to ~/.ssh/id_ed25519 and uploads it
  # to a live, world-readable user-attachments URL.
  if [ -L "$ENTRY_PATH" ]; then REASON="symlink refused"    ; fail_entry ; continue ; fi
  if [ ! -e "$ENTRY_PATH" ]; then REASON="file missing"     ; fail_entry ; continue ; fi
  if [ ! -f "$ENTRY_PATH" ]; then REASON="not a regular file" ; fail_entry ; continue ; fi
  # The parent is bound on its own so the `cd` status is the one observed:
  # appending `/$(basename …)` to the substitution takes the status from
  # `basename`, which succeeds on anything — and a failed `cd` then yielded a
  # bare `/<name>` that this arm never saw.
  if ! ENTRY_DIR="$(cd -- "$(dirname -- "$ENTRY_PATH")" && pwd -P)"; then
    REASON="file missing" ; fail_entry ; continue
  fi
  RESOLVED="$ENTRY_DIR/$(basename -- "$ENTRY_PATH")"
  # The same two tests on the value `--attach` receives: `pwd -P` resolves a
  # symlinked parent, so a `#` in a directory ABOVE the entry reaches the
  # command without ever appearing in $ENTRY_PATH.
  case "$RESOLVED" in
    *"$NEWLINE"*) REASON="newline in path" ; fail_entry ; continue ;;
    *"#"*)        REASON="# in path"       ; fail_entry ; continue ;;
  esac
  # Resolved before comparing, so `..` cannot climb out of the root.
  case "$RESOLVED" in
    "$CAPTURE_ROOT"/*) : ;;
    *) REASON="outside the declared root" ; fail_entry ; continue ;;
  esac
  # By content type, never by extension, and no type fails: unverified is not
  # an image. That keeps a .env or an id_ed25519 off a public URL.
  MIME="$(file -b --mime-type -- "$RESOLVED" 2>/dev/null || true)"
  case "$MIME" in
    image/*) : ;;
    *) REASON="not an image" ; fail_entry ; continue ;;
  esac

  # The argument is $RESOLVED, never $ENTRY_PATH: every check ran against
  # $RESOLVED, and the unresolved name is a path nothing validated. `:?`
  # refuses to run at all on an empty value. One file per command, so
  # attribution is exact.
  PREVIOUS="$AFTER"
  if gh pr edit "$NUMBER" --repo "$REPO_SPEC" --attach "${RESOLVED:?}" </dev/null; then
    ATTACHED=yes
  else
    ATTACHED=no
  fi
  # After EVERY attach, success or not, and BEFORE the status is acted on: a
  # non-zero exit may still have updated the PR. Guarded the way the
  # pre-image is, because an unguarded read binds "" on a transient failure —
  # which reads as "the host removed the body".
  if ! AFTER_JSON="$(gh pr view "$NUMBER" --repo "$REPO_SPEC" --json body </dev/null)"; then
    REASON="body read failed" ; fail_entry ; continue
  fi
  if ! printf '%s' "$AFTER_JSON" | jq -e 'has("body") and (.body | type == "string")' >/dev/null; then
    REASON="body read failed" ; fail_entry ; continue
  fi
  if ! AFTER="$(printf '%s' "$AFTER_JSON" | jq -r '.body | gsub("\r";"")')"; then
    REASON="body read failed" ; fail_entry ; continue
  fi
  # A failed attach records its class and CONTINUES. Falling through instead
  # would carry a suffix built from someone else's append into the harvest,
  # where it is the sole candidate, never trips the ambiguity guard, and binds
  # to this entry's caption.
  if [ "$ATTACHED" != yes ]; then
    REASON="attach failed" ; fail_entry ; continue
  fi
  # The harvest runs over $SUFFIX — the part of the body that appeared since
  # the last read. A body that no longer starts with the previous read is not a
  # suffix at all.
  case "$AFTER" in
    "$PREVIOUS"*) SUFFIX="${AFTER#"$PREVIOUS"}" ;;
    *) REASON="body changed during upload" ; fail_entry ; continue ;;
  esac
  harvest "$SUFFIX"
  if [ -n "$ASSET_URL" ]; then
    printf '%s\t%s\n' "$ASSET_URL" "$ENTRY_PATH" >>"$ASSETS_FILE"
  else
    REASON="${REASON:-no attachment URL}" ; fail_entry
  fi
done <"$PATHS_FILE"

printf '%s' "$AFTER" >"$RUN_DIR/after.md"

# --- The lost-update guard --------------------------------------------------
#
# `AFTER` must start with the pre-image — and that test alone is vacuous when
# the pre-image is empty, because every string starts with "". The empty case
# therefore has its own arm: all AFTER may hold is the tails the attach
# appended, since anything else there was written by somebody else during the
# window.
#
# One gap is named and accepted: a concurrent APPEND keeps the prefix and is
# dropped by the pre-image-based write. The other is closed — a run whose
# re-read failed cannot prove its baseline current, so it never writes.

if [ "$READ_FAILED" = yes ]; then
  : >"$RUN_DIR/read-failed"
  printf 'a body re-read failed, so the baseline cannot be proved current\n' >&2
  exit 4
fi
if [ -z "$PRE_IMAGE" ]; then
  # A line is this run's own only if it is blank, or an image line whose URL
  # is on the SAME attachment allowlist the harvest applies. The alt cannot
  # identify it — `--attach` appends a tail whose alt the HOST derives from
  # the file it received, so this skill never sees it — which leaves the URL
  # as the only provenance there is. Matching image SHAPE alone classified
  # another writer's `![beacon](https://evil.example/track.png)` as ours and
  # the write then dropped it, while their prose in the same position exited
  # 4. `harvest` is called rather than restated: a second copy of the
  # allowlist is a second copy to drift.
  #
  # A loop over lines, never `grep -q` at the end of a pipeline: `grep -q`
  # exits on its first match, and under `pipefail` the SIGPIPE that kills the
  # upstream stage becomes the status the `if` reads — so past the pipe
  # buffer the guard silently skipped.
  FOREIGN=""
  while IFS= read -r LINE; do
    case "$LINE" in
      *[![:space:]]*) : ;;
      *) continue ;;                     # blank, or whitespace alone
    esac
    case "$LINE" in
      '!['*']('*')') : ;;
      *) FOREIGN="$LINE" ; break ;;      # prose, or anything else not an image line
    esac
    harvest "$LINE"
    if [ -z "$ASSET_URL" ]; then
      FOREIGN="$LINE" ; break            # an image, on a host this run never attached to
    fi
  done <<<"$AFTER"
  if [ -n "$FOREIGN" ]; then
    printf 'the body was empty and now holds a line this run did not append: %s\n' "$FOREIGN" >&2
    exit 4
  fi
else
  case "$AFTER" in
    "$PRE_IMAGE"*) : ;;
    *)
      printf 'the body no longer starts with the pre-image — another writer replaced it\n' >&2
      exit 4
      ;;
  esac
fi
