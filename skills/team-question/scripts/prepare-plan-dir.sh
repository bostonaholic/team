#!/usr/bin/env bash
#
# Build a QUESTION artifact id with skills/team/scripts/plan-id.sh, create
# docs/plans/<id>/, and report which QUESTION artifacts it already holds.
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
#   1  could not create the directory, or skills/team/scripts/plan-id.sh is missing
#   2  usage fault or an invalid topic, ticket, or date, as plan-id.sh reports it
#   3  2-questions.md exists without 1-task.md; a new dispatch would overwrite it

set -euo pipefail
export LC_ALL=C

die() {
  printf 'prepare-plan-dir: %s\n' "$2" >&2
  exit "$1"
}

# The shared id builder in the team skill, a sibling of this skill.
plan_id="$(dirname "${BASH_SOURCE[0]}")/../../team/scripts/plan-id.sh"
[ -x "$plan_id" ] || die 1 "missing helper: $plan_id"

[ "${1:-}" != "--parse" ] || die 2 "unknown option: --parse"
# plan-id.sh validates the topic, ticket, and date; its exit 2 passes through.
built="$("$plan_id" "$@")" || exit "$?"
field() { printf '%s\n' "$built" | sed -n "s/^$1=//p"; }
id="$(field id)"
date="$(field date)"
ticket="$(field ticketId)"
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
printf 'ticketId=%s\n' "$ticket"
printf 'state=%s\n' "$state"
for file in 1-task.md 2-questions.md 3-prd.md 4-repos.md; do
  if [ -f "$dir$file" ]; then printf 'artifact=%s\n' "$dir$file"; fi
done
exit 0
