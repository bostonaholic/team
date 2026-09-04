#!/usr/bin/env bash
# Acceptance suite for artifact-directory discovery and its eight consumers.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILLS="$ROOT/skills"
HELPER="$SKILLS/team/discover-topic.sh"

cleanup() {
  [ -n "${fixture:-}" ] && \rm -rf "$fixture" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

ERRORS=0
fail() {
  ERRORS=$((ERRORS + 1))
  printf 'FAIL [%s]\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3" >&2
}

run_helper() {
  local cwd="$1" explicit_path="$2" predecessor="$3" review_flag="${4:-}"
  if [ -n "$review_flag" ]; then
    (cd "$cwd" && "$HELPER" "$explicit_path" "$predecessor" "$review_flag" 2>/dev/null)
  else
    (cd "$cwd" && "$HELPER" "$explicit_path" "$predecessor" 2>/dev/null)
  fi
}

skill_surface() {
  local directory="$1" file
  cat "$directory/SKILL.md"
  for file in "$directory"/references/*.md; do
    [ -f "$file" ] && cat "$file"
  done
}

A_SKILLS=(team-research team-design team-structure team-plan team-worktree team-implement team-pr eng-design-doc-review)
A_PREDECESSORS=(2-questions.md 5-research.md 6-design.md 7-structure.md 8-plan.md 8-plan.md 6-design.md 6-design.md)

if [ ! -x "$HELPER" ]; then
  fail "helper executable" "$HELPER exists and is executable" "missing or not executable"
fi
grep -qF "ID_RE='^([A-Za-z][A-Za-z0-9_]*-[0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2})-[a-z0-9][a-z0-9-]*$'" "$HELPER" \
  || fail "helper ID_RE" "canonical ID_RE" "missing or changed"
grep -qF 'PHASE_FILES="1-task 2-questions 5-research 6-design 7-structure 8-plan"' "$HELPER" \
  || fail "helper PHASE_FILES" "canonical phase-file list" "missing or changed"
grep -qF 'stat -f %m' "$HELPER" \
  || fail "helper macOS stat" "stat -f %m fallback" "missing"
grep -qF 'stat -c %Y' "$HELPER" \
  || fail "helper Linux stat" "stat -c %Y fallback" "missing"
if grep -qE 'CLAUDE_PLUGIN_ROOT|CLAUDE_PROJECT_DIR|source[[:space:]]|^[[:space:]]*\.[[:space:]]' "$HELPER"; then
  fail "helper portability" "no host variables or relative imports" "host variable or import found"
fi

("$HELPER" >/dev/null 2>&1)
status=$?
[ "$status" -eq 2 ] || fail "helper missing arguments" "exit 2" "exit $status"
("$HELPER" '5-research.md' >/dev/null 2>&1)
status=$?
[ "$status" -eq 2 ] || fail "helper missing predecessor" "exit 2" "exit $status"
("$HELPER" '' '5-research.md' '--unknown' >/dev/null 2>&1)
status=$?
[ "$status" -eq 2 ] || fail "helper unknown option" "exit 2" "exit $status"
("$HELPER" '' '5-research.md' '' >/dev/null 2>&1)
status=$?
[ "$status" -eq 2 ] || fail "helper empty option" "exit 2" "exit $status"
("$HELPER" '' '5-research.md' '--require-passing-review' 'extra' >/dev/null 2>&1)
status=$?
[ "$status" -eq 2 ] || fail "helper extra argument" "exit 2" "exit $status"

i=0
while [ "$i" -lt "${#A_SKILLS[@]}" ]; do
  skill="${A_SKILLS[$i]}"
  predecessor="${A_PREDECESSORS[$i]}"
  file="$SKILLS/$skill/SKILL.md"
  surface="$(skill_surface "$SKILLS/$skill")"
  expected='"<team-skill-dir>/discover-topic.sh" "${ARGUMENTS:-}" "'"$predecessor"'"'
  [ "$skill" = "team-structure" ] && expected="$expected --require-passing-review"

  if [ ! -f "$file" ]; then
    fail "$skill" "$file exists" "file missing"
    i=$((i + 1))
    continue
  fi
  count="$(grep -Fxc "$expected" <<< "$surface" || true)"
  [ "$count" -eq 1 ] \
    || fail "$skill invocation" "one exact invocation: $expected" "found $count"
  grep -qF '`<team-skill-dir>` to the absolute directory containing' <<< "$surface" \
    || fail "$skill path resolution" "absolute <team-skill-dir> resolution instruction" "instruction missing"
  grep -qF '`skills/team/SKILL.md`' <<< "$surface" \
    || fail "$skill path contract" "skills/team/SKILL.md anchor" "anchor missing"
  if grep -qF 'ID_RE=' <<< "$surface" || grep -qF 'PHASE_FILES=' <<< "$surface"; then
    fail "$skill deduplication" "no embedded resolver implementation" "resolver token remains"
  fi
  if [ "$skill" != "team-structure" ] && grep -qF -- '--require-passing-review' <<< "$surface"; then
    fail "$skill review flag" "review flag absent" "review flag found"
  fi
  i=$((i + 1))
done

for skill in team-research team-design team-structure team-plan team-worktree team-implement eng-design-doc-review; do
  surface="$(skill_surface "$SKILLS/$skill")"
  grep -qF 'AskUserQuestion' <<< "$surface" \
    || fail "$skill fallback" "retains AskUserQuestion fallback" "fallback missing"
done
team_implement_surface="$(skill_surface "$SKILLS/team-implement")"
team_pr_surface="$(skill_surface "$SKILLS/team-pr")"
grep -qF 'Describe the task' <<< "$team_implement_surface" \
  || fail "team-implement fallback" "retains Describe the task option" "option missing"
if grep -qF 'AskUserQuestion' <<< "$team_pr_surface"; then
  fail "team-pr fallback" "no AskUserQuestion; fall through to standalone" "AskUserQuestion found"
fi
grep -qF 'Nothing to ship.' <<< "$team_pr_surface" \
  || fail "team-pr standalone" "retains Nothing to ship." "standalone stop missing"

# Explicit paths win verbatim, including paths outside ID_RE and review-gated use.
fixture="$(mktemp -d)"
mkdir -p "$fixture/docs/plans/NotAValidId"
output="$(run_helper "$fixture" 'docs/plans/NotAValidId' '6-design.md' '--require-passing-review')"
status=$?
[ "$status" -eq 0 ] || fail "explicit status" "exit 0" "exit $status"
[ "$output" = 'docs/plans/NotAValidId' ] \
  || fail "explicit path" "verbatim explicit path" "got: '$output'"
\rm -rf "$fixture"
fixture=""

# Discovery filters ID_RE and predecessor, then ranks by max phase-file mtime.
fixture="$(mktemp -d)"
mkdir -p "$fixture/docs/plans/2026-01-01-predecessor-newer" \
  "$fixture/docs/plans/2026-01-02-phase-newer" \
  "$fixture/docs/plans/2026-01-03-missing" \
  "$fixture/docs/plans/NotAValidId"
: > "$fixture/docs/plans/2026-01-01-predecessor-newer/5-research.md"
: > "$fixture/docs/plans/2026-01-02-phase-newer/5-research.md"
: > "$fixture/docs/plans/2026-01-02-phase-newer/6-design.md"
: > "$fixture/docs/plans/2026-01-03-missing/2-questions.md"
: > "$fixture/docs/plans/NotAValidId/5-research.md"
touch -t 202601030000 "$fixture/docs/plans/2026-01-01-predecessor-newer/5-research.md"
touch -t 202601010000 "$fixture/docs/plans/2026-01-02-phase-newer/5-research.md"
touch -t 202601040000 "$fixture/docs/plans/2026-01-02-phase-newer/6-design.md"
output="$(run_helper "$fixture" '/no/such/path' '5-research.md')"
status=$?
[ "$status" -eq 0 ] || fail "discovery status" "exit 0" "exit $status"
case "$output" in
  *2026-01-02-phase-newer/) : ;;
  *) fail "discovery filters and recency" "2026-01-02-phase-newer/" "got: '$output'" ;;
esac
\rm -rf "$fixture"
fixture=""

# No match prints nothing and exits 0.
fixture="$(mktemp -d)"
mkdir -p "$fixture/docs/plans"
output="$(run_helper "$fixture" '' '8-plan.md')"
status=$?
[ "$status" -eq 0 ] || fail "no-match status" "exit 0" "exit $status"
[ -z "$output" ] || fail "no-match stdout" "empty stdout" "got: '$output'"
\rm -rf "$fixture"
fixture=""

write_review_fixture() {
  local directory="$1" review_body="$2"
  mkdir -p "$directory"
  : > "$directory/6-design.md"
  printf '%s' "$review_body" > "$directory/design-review-1.md"
}

# Review flag selects only candidates whose highest numeric review passes.
fixture="$(mktemp -d)"
write_review_fixture "$fixture/docs/plans/2026-01-01-passed" $'---\nverdict: COMMENT\n---\n'
write_review_fixture "$fixture/docs/plans/2026-01-02-failed" $'---\nverdict: REQUEST CHANGES\n---\n'
touch -t 202601010000 "$fixture/docs/plans/2026-01-01-passed/6-design.md"
touch -t 202601020000 "$fixture/docs/plans/2026-01-02-failed/6-design.md"
output="$(run_helper "$fixture" '' '6-design.md' '--require-passing-review')"
case "$output" in
  *2026-01-01-passed/) : ;;
  *) fail "review eligibility" "older passing candidate" "got: '$output'" ;;
esac
\rm -rf "$fixture"
fixture=""

# Highest numeric review supersedes earlier reviews.
fixture="$(mktemp -d)"
write_review_fixture "$fixture/docs/plans/2026-01-01-superseded" $'---\nverdict: APPROVE\n---\n'
printf '%s' $'---\nverdict: REQUEST CHANGES\n---\n' \
  > "$fixture/docs/plans/2026-01-01-superseded/design-review-2.md"
output="$(run_helper "$fixture" '' '6-design.md' '--require-passing-review')"
[ -z "$output" ] || fail "review highest number" "empty stdout" "got: '$output'"
\rm -rf "$fixture"
fixture=""

# Frontmatter parsing fails closed: review required, line 1 marker, body excluded,
# closing marker required within the 60-line cap.
for case_name in missing-review bad-line-one body-verdict unclosed over-cap; do
  fixture="$(mktemp -d)"
  directory="$fixture/docs/plans/2026-01-01-$case_name"
  mkdir -p "$directory"
  : > "$directory/6-design.md"
  case "$case_name" in
    missing-review) ;;
    bad-line-one) printf '%s' $'phase: design-review\nverdict: APPROVE\n---\n' > "$directory/design-review-1.md" ;;
    body-verdict) printf '%s' $'---\nphase: design-review\n---\nverdict: APPROVE\n' > "$directory/design-review-1.md" ;;
    unclosed) printf '%s' $'---\nverdict: APPROVE\n' > "$directory/design-review-1.md" ;;
    over-cap)
      {
        printf '%s\n' '---' 'verdict: APPROVE'
        line=3
        while [ "$line" -le 60 ]; do printf 'key%s: value\n' "$line"; line=$((line + 1)); done
        printf '%s\n' '---'
      } > "$directory/design-review-1.md"
      ;;
  esac
  output="$(run_helper "$fixture" '' '6-design.md' '--require-passing-review')"
  [ -z "$output" ] || fail "review $case_name" "empty stdout" "got: '$output'"
  \rm -rf "$fixture"
  fixture=""
done

# Research isolation and standalone behavior remain intact.
research_file="$SKILLS/team-research/SKILL.md"
dispatch="$(awk '/^2\. Dispatch/ { capture=1 } /^3\./ { capture=0 } capture { print }' "$research_file")"
printf '%s' "$dispatch" | grep -qF '2-questions.md' \
  || fail "team-research dispatch" "forwards 2-questions.md" "missing"
printf '%s' "$dispatch" | grep -qF '4-repos.md' \
  || fail "team-research dispatch" "forwards optional 4-repos.md" "missing"
if printf '%s' "$dispatch" | grep -qiE 'pass[^.]*1-task\.md|forward[^.]*1-task\.md|include[^.]*1-task\.md'; then
  fail "team-research dispatch" "does not forward 1-task.md" "forwarding reference found"
fi
grep -qF 'If `$ARGUMENTS/8-plan.md` does not exist' <<< "$team_implement_surface" \
  || fail "team-implement standalone" "retains 8-plan.md-absent branch" "branch missing"
grep -qF 'symbolic-ref refs/remotes/origin/HEAD' <<< "$team_pr_surface" \
  || fail "team-pr base detection" "retains origin HEAD detection" "command missing"

if [ "$ERRORS" -ne 0 ]; then
  printf '\n%s assertion(s) failed.\n' "$ERRORS" >&2
  exit 1
fi
printf '\nAll discovery-consistency assertions passed.\n'
