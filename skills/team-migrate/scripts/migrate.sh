#!/bin/bash
#
# Move a machine set up before Team v0.147.0 onto the pipeline-only Team
# plugin plus the bostonaholic/skills plugin, in every agent harness on it.
#
#   usage: migrate.sh plan
#          migrate.sh apply <plan-id>
#          DRY_RUN=true migrate.sh apply <plan-id>
#
# `plan` reads every harness and prints the steps it would run, in order, each
# with the gap it closes and its exact command, then `Plan id: <40 hex>`. It
# changes nothing. `apply` reads every harness again and runs the steps only
# when that plan still has the id the user confirmed, from a copy of this
# skill at ${XDG_DATA_HOME:-~/.local/share}/team-migrate/run: a dev uninstall
# can remove the plugin directory the skill was started from, and verify.sh
# runs from that copy afterwards. With DRY_RUN=true it prints each command
# instead of running it, and makes no copy.
#
# Step order: the release clone, the moved skills under their new names, stale
# registrations, old copies moved to a `-retired` sibling directory, a full
# `script/dev-uninstall` from each checkout that installed Team, then Team from
# GitHub (Claude Code, Codex) or from the release clone (Antigravity, OpenCode,
# Cursor). A run that stops at any step leaves every moved skill reachable.
# No skill copy is deleted, an existing retired copy is never overwritten, and
# a second run plans nothing.
#
# Output: the plan, or one `[n/total]` line per step followed by that step's
# own output. Errors go to stderr.
#
# Exit codes:
#   0  plan printed, or every step ran
#   1  a step failed; its line names it and the steps not run, or the
#      machine could not be read
#   2  usage fault
#   3  the plan changed since it was confirmed; nothing ran
#   4  the plan is blocked; nothing ran

set -euo pipefail
export LC_ALL=C

# shellcheck source=lib.sh
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

usage() {
  printf 'usage: %s plan | %s apply <plan-id>\n' "$0" "$0" >&2
  exit 2
}

case "${1:-}" in
  plan) [ "$#" -eq 1 ] || usage ;;
  apply)
    [ "$#" -eq 2 ] || usage
    case "$2" in *[!0-9a-f]* | "") usage ;; esac
    [ "${#2}" -eq 40 ] || usage
    ;;
  *) usage ;;
esac
has git || die "git is not on PATH"
has node || die "node is not on PATH"

RUN_MODE=run

# Every command goes through here, so the plan shows exactly what apply runs.
run() {
  if [ "$RUN_MODE" = show ] || [ "${DRY_RUN:-}" = true ]; then
    if [ "$RUN_MODE" = show ]; then printf '     $'; else printf '  [dry run]'; fi
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

# Moves each named entry of a directory into its -retired sibling. Every
# target is checked absent first, `mv -n` never replaces a file, and each move
# is checked after it runs.
retire() {  # <dir> <names>
  local dir="$1" names="$2" name moved=""
  set --
  for name in $names; do
    if [ "$RUN_MODE" = run ]; then
      if ! present "$dir/$name"; then
        echo "  skip: $dir/$name is already gone"
        continue
      fi
      if present "$dir-retired/$name"; then
        echo "team-migrate: $dir-retired/$name already exists; move $dir/$name aside by hand" >&2
        return 1
      fi
    fi
    set -- "$@" "$dir/$name"
    moved="$moved $name"
  done
  [ "$#" -gt 0 ] || return 0
  run mkdir -p "$dir-retired" && run mv -n "$@" "$dir-retired/" || return 1
  if [ "$RUN_MODE" != run ] || [ "${DRY_RUN:-}" = true ]; then return 0; fi
  for name in $moved; do
    if present "$dir/$name" || ! present "$dir-retired/$name"; then
      echo "team-migrate: $dir/$name did not move to $dir-retired/$name" >&2
      return 1
    fi
  done
}

record_checkout() {
  if [ "$RUN_MODE" != run ] || [ "${DRY_RUN:-}" = true ]; then return 0; fi
  mkdir -p "$MIGRATE_HOME"
  grep -qxF "$1" "$CHECKOUTS_FILE" 2>/dev/null || printf '%s\n' "$1" >> "$CHECKOUTS_FILE"
}

run_step() {  # <action> <arg> <arg2>
  case "$1" in
    release-clone)
      run mkdir -p "$MIGRATE_HOME" &&
        run git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$2" "$TEAM_URL" "$RELEASE_DIR" ;;
    release-update)
      run git -C "$RELEASE_DIR" fetch --quiet --depth 1 origin tag "$2" &&
        run git -C "$RELEASE_DIR" -c advice.detachedHead=false checkout --quiet --detach "$2" ;;
    claude-marketplace-add) run claude plugin marketplace add "$2" ;;
    claude-marketplace-update) run claude plugin marketplace update "$2" ;;
    claude-marketplace-remove) run claude plugin marketplace remove "$2" ;;
    claude-install) run claude plugin install "$2" --scope user ;;
    claude-update) run claude plugin update "$2" --scope user ;;
    claude-uninstall) run claude plugin uninstall "$2" --scope "$3" ;;
    codex-marketplace-add) run codex plugin marketplace add "$2" ;;
    codex-marketplace-upgrade) run codex plugin marketplace upgrade "$2" ;;
    codex-marketplace-remove) run codex plugin marketplace remove "$2" ;;
    codex-add) run codex plugin add "$2" ;;
    codex-remove) run codex plugin remove "$2" ;;
    collection-copy)
      # $2 is a list of fixed harness names, split on purpose.
      # shellcheck disable=SC2086
      run "$LIB_DIR/copy-collection.sh" "$3" $2 ;;
    retire) retire "$2" "$3" ;;
    agy-uninstall) run agy plugin uninstall "$2" ;;
    agy-install)
      # agy writes through a link at its target, into the checkout it names.
      if [ "$RUN_MODE" = run ] && [ "${DRY_RUN:-}" != true ] && [ -L "$AGY_TEAM" ]; then
        echo "team-migrate: $AGY_TEAM is still a link; refusing to install through it" >&2
        return 1
      fi
      run agy plugin install "$2" ;;
    release-uninstall) run "$RELEASE_DIR/script/dev-uninstall-$2" ;;
    release-install) run "$RELEASE_DIR/script/dev-install-$2" ;;
    # Recorded first, so a later run finds the checkout's hooks even when this
    # uninstall stops partway.
    dev-uninstall) record_checkout "$2" && run "$2/script/dev-uninstall" ;;
    *) die "unknown step action: $1" ;;
  esac
}

render_plan() {
  local n=0 harness action arg arg2 gap labels="" touched="" line
  echo "Team migration plan"
  echo "  Latest: Team $TEAM_TAG, $SKILLS_SOURCE $SKILLS_TAG"
  echo "  Harnesses on this machine: ${HARNESSES:-none}"
  if [ -z "$STEPS" ] && [ -z "$BLOCKS" ]; then
    echo "Nothing to do."
  fi
  if [ -n "$STEPS" ]; then
    labels=" $(printf '%s' "$STEPS" | cut -d "$SEP" -f1 | tr '\n' ' ')"
    for line in claude codex antigravity opencode cursor; do
      if in_list "$line" "$labels"; then touched="$touched $line"; fi
    done
    case "$labels" in *"other agents"*) touched="$touched, other agents" ;; esac
    echo "  Touched by this plan:$touched"
    echo "Steps, in order:"
    RUN_MODE=show
    while IFS="$SEP" read -r harness action arg arg2 gap; do
      [ -n "$action" ] || continue
      n=$((n + 1))
      printf '  %d. [%s] gap: %s\n' "$n" "$harness" "$gap"
      run_step "$action" "$arg" "$arg2"
    done <<< "$STEPS"
    RUN_MODE=run
  fi
  if [ -n "$BLOCKS" ]; then
    echo "Blocked; nothing runs until each is resolved:"
    while IFS= read -r line; do
      [ -z "$line" ] || printf '  - %s\n' "$line"
    done <<< "$BLOCKS"
  fi
  if [ -n "$SESSIONS" ]; then
    echo "Other agent sessions are running. Each keeps what it loaded until restarted:"
    while IFS= read -r line; do printf '  - %s\n' "$line"; done <<< "$SESSIONS"
  fi
  echo "Plan id: $PLAN_ID"
}

# A dev uninstall can remove the plugin directory this skill runs from, so
# apply runs from its own copy, where verify.sh stays afterwards.
run_from_copy() {
  local staging
  if same_dir "$PLUGIN_ROOT" "$RUN_ROOT"; then return 0; fi
  mkdir -p "$MIGRATE_HOME"
  staging="$(mktemp -d "$MIGRATE_HOME/.run.XXXXXX")"
  cp "$README" "$staging/README.md"
  cp -R "$PLUGIN_ROOT/skills" "$staging/skills"
  rm -rf "${RUN_ROOT:?}"
  mv "$staging" "$RUN_ROOT"
  exec "${BASH:-bash}" "$RUN_ROOT/skills/team-migrate/scripts/migrate.sh" apply "$1"
}

apply_plan() {
  local total n=0 harness action arg arg2 gap rest
  if [ "$1" != "$PLAN_ID" ]; then
    echo "team-migrate: the plan changed since it was confirmed (now $PLAN_ID); nothing ran" >&2
    exit 3
  fi
  if [ -n "$BLOCKS" ]; then
    printf 'team-migrate: blocked; nothing ran:\n%s' "$BLOCKS" >&2
    exit 4
  fi
  if [ -z "$STEPS" ]; then
    echo "Nothing to do."
    return 0
  fi
  if [ "${DRY_RUN:-}" != true ]; then run_from_copy "$1"; fi
  total="$(printf '%s' "$STEPS" | grep -c .)"
  while IFS="$SEP" read -r harness action arg arg2 gap; do
    [ -n "$action" ] || continue
    n=$((n + 1))
    printf '[%d/%d] [%s] %s\n' "$n" "$total" "$harness" "$gap"
    if ! run_step "$action" "$arg" "$arg2"; then
      printf 'team-migrate: step %d failed: [%s] %s\n' "$n" "$harness" "$gap" >&2
      rest="$(printf '%s' "$STEPS" | awk -F "$SEP" -v from="$((n + 1))" 'NR >= from { printf "  not run: [%s] %s\n", $1, $5 }')"
      [ -z "$rest" ] || printf '%s\n' "$rest" >&2
      exit 1
    fi
  done <<< "$STEPS"
  echo "Done. Verify with $RUN_ROOT/skills/team-migrate/scripts/verify.sh, then restart every agent session to load the result."
}

compute_plan
# Outside any repository, so the id is always SHA-1's 40 hex.
PLAN_ID="$(printf '%s' "$STEPS" | (cd / && git hash-object --stdin))"
case "$1" in
  plan)
    render_plan
    [ -z "$BLOCKS" ] || exit 4
    ;;
  apply) apply_plan "$2" ;;
esac
