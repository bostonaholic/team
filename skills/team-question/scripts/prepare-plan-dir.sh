#!/usr/bin/env bash
#
# Derive a QUESTION artifact id, create docs/plans/<id>/, and report which
# QUESTION artifacts it already holds.
#
#   usage: prepare-plan-dir.sh [--ticket <ID>] [--date <YYYY-MM-DD>] <topic>
#
# Run it from the repository root; docs/plans/ resolves against the current
# directory.
#
#   <topic>    2-4 word kebab-case slug, e.g. add-rate-limiting
#   --ticket   ticket identifier such as ENG-1234; the id becomes
#              <ID>-<topic>. Without it the id is <date>-<topic>
#   --date     the artifact date; defaults to today's local date. Pass the
#              first run's date on a rerun so the id cannot drift past midnight
#
# Creating the directory is idempotent. Prints these lines to stdout, in order:
#
#   id=<id>
#   dir=docs/plans/<id>/
#   date=<YYYY-MM-DD>
#   ticketId=<ID>|null
#   state=new|questions-only|complete
#   artifact=docs/plans/<id>/<file>     one per existing file, in order:
#                                       1-task.md 2-questions.md 3-prd.md 4-repos.md
#
# state: new (no 1-task.md), questions-only (1-task.md without
# 2-questions.md), complete (both exist).
#
# Exit codes:
#
#   0  printed the state
#   1  could not create the directory
#   2  usage fault or an invalid topic, ticket, or date
#   3  2-questions.md exists without 1-task.md; a new dispatch would overwrite it

set -euo pipefail
export LC_ALL=C

# 2-4 words: the topic-slug rule in SKILL.md. A subset of ID_RE's topic part
# in skills/team/discover-topic.sh, so every id built here is discoverable.
TOPIC_RE='^[a-z0-9]+(-[a-z0-9]+){1,3}$'
# The ticket part of ID_RE in skills/team/discover-topic.sh.
TICKET_RE='^[A-Za-z][A-Za-z0-9_]*-[0-9]+$'
DATE_RE='^[0-9]{4}-[0-9]{2}-[0-9]{2}$'

die() {
  printf 'prepare-plan-dir: %s\n' "$2" >&2
  exit "$1"
}

ticket=""
date=""
topic=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --ticket) [ "$#" -ge 2 ] || die 2 "--ticket needs a value"; ticket="$2"; shift 2 ;;
    --date) [ "$#" -ge 2 ] || die 2 "--date needs a value"; date="$2"; shift 2 ;;
    -*) die 2 "unknown option: $1" ;;
    *) [ -z "$topic" ] || die 2 "unexpected argument: $1"; topic="$1"; shift ;;
  esac
done

[ -n "$topic" ] || die 2 "usage: prepare-plan-dir.sh [--ticket <ID>] [--date <YYYY-MM-DD>] <topic>"
printf '%s' "$topic" | grep -qE "$TOPIC_RE" \
  || die 2 "topic must be 2-4 lowercase kebab-case words: $topic"
if [ -n "$ticket" ]; then
  printf '%s' "$ticket" | grep -qE "$TICKET_RE" \
    || die 2 "ticket must look like ENG-1234: $ticket"
fi
[ -n "$date" ] || date="$(date +%Y-%m-%d)"
printf '%s' "$date" | grep -qE "$DATE_RE" || die 2 "date must be YYYY-MM-DD: $date"

if [ -n "$ticket" ]; then
  id="$ticket-$topic"
else
  id="$date-$topic"
fi
dir="docs/plans/$id/"

mkdir -p "$dir" || die 1 "cannot create $dir"

if [ -f "${dir}1-task.md" ]; then
  if [ -f "${dir}2-questions.md" ]; then state=complete; else state=questions-only; fi
else
  [ ! -f "${dir}2-questions.md" ] \
    || die 3 "${dir}2-questions.md exists without ${dir}1-task.md"
  state=new
fi

printf 'id=%s\n' "$id"
printf 'dir=%s\n' "$dir"
printf 'date=%s\n' "$date"
printf 'ticketId=%s\n' "${ticket:-null}"
printf 'state=%s\n' "$state"
for file in 1-task.md 2-questions.md 3-prd.md 4-repos.md; do
  if [ -f "$dir$file" ]; then printf 'artifact=%s\n' "$dir$file"; fi
done
exit 0
