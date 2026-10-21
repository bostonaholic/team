#!/usr/bin/env bash
#
# Build or parse a docs/plans/<id> artifact id: <TICKET>-<topic> or
# <YYYY-MM-DD>-<topic>. The one owner of ID_RE.
#
#   usage: plan-id.sh [--ticket <ID>] [--date <YYYY-MM-DD>] <topic>
#          plan-id.sh --parse <id>
#
# Build mode:
#   <topic>    2-4 word lowercase kebab-case slug, e.g. add-rate-limiting
#   --ticket   ticket identifier such as ENG-1234; the id becomes <ID>-<topic>.
#              Without it the id is <date>-<topic>
#   --date     the artifact date; defaults to today's local date. Pass the
#              first run's date on a rerun so the id cannot drift past midnight
#   Prints, in order:
#     id=<id>
#     topic=<topic>
#     date=<YYYY-MM-DD>
#     ticketId=<ID>|null
#
# Parse mode: checks <id> against ID_RE, the rule discover-topic.sh filters
# docs/plans/ by, and prints, in order:
#     id=<id>
#     topic=<id minus its ticket or date prefix>
#     ticketId=<ID>|null
#
# Exit codes:
#   0  built, or parsed a valid id
#   1  parse mode: not a valid id; prints nothing
#   2  usage fault, or an invalid topic, ticket, or date

set -euo pipefail
export LC_ALL=C

TICKET_PART='[A-Za-z][A-Za-z0-9_]*-[0-9]+'
DATE_PART='[0-9]{4}-[0-9]{2}-[0-9]{2}'
# Looser than TOPIC_RE so ids built before the 2-4 word rule stay discoverable.
ID_RE="^(($TICKET_PART)|$DATE_PART)-([a-z0-9][a-z0-9-]*)\$"
# 2-4 words: the topic-slug rule for every new id.
TOPIC_RE='^[a-z0-9]+(-[a-z0-9]+){1,3}$'

die() {
  printf 'plan-id: %s\n' "$2" >&2
  exit "$1"
}

if [ "${1:-}" = "--parse" ]; then
  [ "$#" -eq 2 ] || die 2 "usage: plan-id.sh --parse <id>"
  [[ "$2" =~ $ID_RE ]] || exit 1
  printf 'id=%s\n' "$2"
  printf 'topic=%s\n' "${BASH_REMATCH[3]}"
  printf 'ticketId=%s\n' "${BASH_REMATCH[2]:-null}"
  exit 0
fi

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

[ -n "$topic" ] || die 2 "usage: plan-id.sh [--ticket <ID>] [--date <YYYY-MM-DD>] <topic>"
[[ "$topic" =~ $TOPIC_RE ]] || die 2 "topic must be 2-4 lowercase kebab-case words: $topic"
if [ -n "$ticket" ]; then
  [[ "$ticket" =~ ^$TICKET_PART$ ]] || die 2 "ticket must look like ENG-1234: $ticket"
fi
[ -n "$date" ] || date="$(date +%Y-%m-%d)"
[[ "$date" =~ ^$DATE_PART$ ]] || die 2 "date must be YYYY-MM-DD: $date"

printf 'id=%s\n' "${ticket:-$date}-$topic"
printf 'topic=%s\n' "$topic"
printf 'date=%s\n' "$date"
printf 'ticketId=%s\n' "${ticket:-null}"
