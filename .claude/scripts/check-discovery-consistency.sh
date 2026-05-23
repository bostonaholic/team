#!/usr/bin/env bash
#
# check-discovery-consistency.sh — acceptance suite for skill-input-discovery.
#
# Dev-only, non-distributed (lives under .claude/, not hooks/) per the
# runtime-vs-development split in CLAUDE.md. This is the committed consistency
# gate for the skill-input-discovery feature: it asserts every archetype-A
# skill carries the discovery block, the load-bearing fragments stay
# byte-identical to canon, and the blind-research invariant holds.
#
# It is the scope fence for the whole feature. If every assertion here passes,
# the feature is intact; any failing assertion names a regression or drift.
#
# set -uo pipefail (NOT -e): every assertion must run so the failure count is
# complete. fail() prints the violating skill + expected-vs-actual and bumps a
# counter; the script exits non-zero with that count unless all pass.
set -uo pipefail

# --- locate the repo root (the dir that holds skills/ and hooks/) ------------
# The script lives at <root>/.claude/scripts/; resolve <root> from its path so
# it runs identically from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILLS="$ROOT/skills"

# --- canonical fragments (the single source of truth) ------------------------
# ID_RE + PHASE_FILES are byte-sourced from hooks/session-start-recover.mjs
# (ported to POSIX ERE: \d -> [0-9]). The approval grep is from
# skills/qrspi-workflow/SKILL.md:290. The root literal is docs/plans/.
# Every archetype-A copy must embed these verbatim; drift here is the bug the
# verbatim-identity check exists to catch.
CANON_ID_RE="ID_RE='^([A-Za-z][A-Za-z0-9_]*-[0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2})-[a-z0-9][a-z0-9-]*\$'"
CANON_PHASE_FILES='PHASE_FILES="task questions research design structure plan"'
CANON_APPROVAL_GREP="grep -qE '^approved:[[:space:]]*true[[:space:]]*\$'"
CANON_ROOT_LITERAL='docs/plans/'
MARKER='Three-tier artifact-directory discovery'

# --- temp cleanup -------------------------------------------------------------
# The executable checks below create a mktemp snippet file and per-fixture
# mktemp -d dirs (`snippet` / `fx`), removed inline on the happy path. This
# trap is the safety net: on EXIT/INT/TERM it removes whatever those vars
# currently point at, so an interrupt never leaks temp artifacts. It touches
# no assertion and no exit code.
cleanup() {
  [ -n "${snippet:-}" ] && \rm -f "$snippet" 2>/dev/null || true
  [ -n "${fx:-}" ] && \rm -rf "$fx" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# --- failure bookkeeping ------------------------------------------------------
ERRORS=0
fail() {
  # $1 = skill/area, $2 = what was expected, $3 = what was actually found
  ERRORS=$((ERRORS + 1))
  printf 'FAIL [%s]\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3" >&2
}

# Predecessor artifact each archetype-A skill consumes (drives coverage).
# Kept as parallel arrays (no associative arrays — portable + readable).
A_SKILLS=(team-research team-design team-structure team-plan team-worktree team-implement team-pr eng-design-doc-review)
A_PREDS=(questions.md research.md design.md structure.md plan.md plan.md design.md design.md)

# Extract the FIRST ```sh fenced block from a SKILL.md into stdout.
# Empty output => no discovery block present (the current, pre-implementation
# state) — callers treat empty extraction as a clean assertion failure, not a
# crash.
extract_sh_block() {
  awk '
    /^```sh$/   { infence=1; next }
    /^```$/     { if (infence) exit }
    infence     { print }
  ' "$1"
}

# Run an extracted snippet in an isolated subprocess against a fixture cwd.
# Args: <snippet-file> <fixture-cwd> <arguments-value>
# Prints the snippet stdout (the resolved dir, or empty for tier 3). Runs in a
# separate `bash` process so the snippet's `exit 0` cannot kill this harness.
run_snippet() {
  local snippet="$1" cwd="$2" args="$3"
  ( cd "$cwd" && ARGUMENTS="$args" bash "$snippet" 2>/dev/null )
}

# =============================================================================
# COVERAGE (slices 1-4): every archetype-A skill carries the marker + correct
# predecessor.
# =============================================================================
i=0
while [ "$i" -lt "${#A_SKILLS[@]}" ]; do
  skill="${A_SKILLS[$i]}"
  pred="${A_PREDS[$i]}"
  file="$SKILLS/$skill/SKILL.md"

  if [ ! -f "$file" ]; then
    fail "$skill" "SKILL.md exists at $file" "file not found"
    i=$((i + 1)); continue
  fi

  if ! grep -qF "$MARKER" "$file"; then
    fail "$skill coverage" "contains discovery marker comment '$MARKER'" "marker absent (no discovery block)"
  fi

  # Predecessor must appear as the PRED= assignment in the discovery block.
  if ! grep -qE "PRED=\"$pred\"" "$file"; then
    fail "$skill predecessor" "discovery block sets PRED=\"$pred\"" "PRED=\"$pred\" not found"
  fi

  i=$((i + 1))
done

# =============================================================================
# VERBATIM-IDENTITY (slices 1-4): the load-bearing fragments are byte-identical
# to canon in every copy. Approval grep present in team-structure + team-plan
# ONLY.
# =============================================================================
i=0
while [ "$i" -lt "${#A_SKILLS[@]}" ]; do
  skill="${A_SKILLS[$i]}"
  file="$SKILLS/$skill/SKILL.md"

  if [ -f "$file" ]; then
    grep -qF "$CANON_ID_RE" "$file" \
      || fail "$skill ID_RE" "verbatim canonical ID_RE line" "ID_RE line missing or drifted"
    grep -qF "$CANON_PHASE_FILES" "$file" \
      || fail "$skill PHASE_FILES" "verbatim canonical PHASE_FILES list" "PHASE_FILES line missing or drifted"
    grep -qF "$CANON_ROOT_LITERAL" "$file" \
      || fail "$skill root literal" "contains '$CANON_ROOT_LITERAL'" "root literal absent"
  fi
  i=$((i + 1))
done

# Approval grep: present verbatim in team-structure + team-plan, absent elsewhere.
for skill in team-structure team-plan; do
  file="$SKILLS/$skill/SKILL.md"
  [ -f "$file" ] && grep -qF "$CANON_APPROVAL_GREP" "$file" \
    || fail "$skill approval grep" "verbatim approval grep in predecessor filter" "approval grep absent"
done
for skill in team-research team-design team-worktree team-implement team-pr eng-design-doc-review; do
  file="$SKILLS/$skill/SKILL.md"
  if [ -f "$file" ] && grep -qF "$CANON_APPROVAL_GREP" "$file"; then
    fail "$skill approval grep" "no approval grep (non-gated skill)" "approval grep unexpectedly present"
  fi
done

# =============================================================================
# EXECUTABLE DISCOVERY BEHAVIOR (slice 1): extract team-design's block, run it
# against fixture trees, assert all edge cases (a)-(e). Fixture is created and
# torn down inside this block.
# =============================================================================
design_file="$SKILLS/team-design/SKILL.md"
snippet="$(mktemp)"
extract_sh_block "$design_file" > "$snippet"

if [ ! -s "$snippet" ]; then
  fail "team-design executable" "extractable \`\`\`sh discovery block" "no discovery block found in team-design (extraction empty)"
else
  # (a) two ID_RE dirs, only one has research.md -> resolves to that one.
  fx="$(mktemp -d)"
  mkdir -p "$fx/docs/plans/2026-01-01-alpha" "$fx/docs/plans/2026-01-02-beta"
  : > "$fx/docs/plans/2026-01-01-alpha/research.md"
  : > "$fx/docs/plans/2026-01-02-beta/questions.md"   # no research.md -> skipped
  out="$(run_snippet "$snippet" "$fx" "")"
  case "$out" in
    *2026-01-01-alpha*) : ;;
    *) fail "team-design (a) predecessor-filter" "resolves docs/plans/2026-01-01-alpha/ (only dir with research.md)" "got: '$out'" ;;
  esac
  \rm -rf "$fx"

  # (b) newest-mtime tiebreak among two valid dirs (both have research.md).
  fx="$(mktemp -d)"
  mkdir -p "$fx/docs/plans/2026-01-01-older" "$fx/docs/plans/2026-01-02-newer"
  : > "$fx/docs/plans/2026-01-01-older/research.md"
  : > "$fx/docs/plans/2026-01-02-newer/research.md"
  # Force older's phase files to an older mtime; newer to "now".
  touch -t 202601010000 "$fx/docs/plans/2026-01-01-older/research.md"
  touch "$fx/docs/plans/2026-01-02-newer/research.md"
  out="$(run_snippet "$snippet" "$fx" "")"
  case "$out" in
    *2026-01-02-newer*) : ;;
    *) fail "team-design (b) newest-mtime" "resolves docs/plans/2026-01-02-newer/ (highest max-mtime)" "got: '$out'" ;;
  esac
  \rm -rf "$fx"

  # (c) empty docs/plans/ -> prints nothing (tier 3).
  fx="$(mktemp -d)"
  mkdir -p "$fx/docs/plans"
  out="$(run_snippet "$snippet" "$fx" "")"
  if [ -n "$out" ]; then
    fail "team-design (c) empty -> tier 3" "prints nothing (falls to AskUserQuestion)" "got: '$out'"
  fi
  \rm -rf "$fx"

  # (d) ARGUMENTS = non-existent path -> falls through to discovery, no error.
  fx="$(mktemp -d)"
  mkdir -p "$fx/docs/plans/2026-01-01-alpha"
  : > "$fx/docs/plans/2026-01-01-alpha/research.md"
  out="$(run_snippet "$snippet" "$fx" "/no/such/path-typo")"
  case "$out" in
    *2026-01-01-alpha*) : ;;
    *) fail "team-design (d) bad ARGUMENTS" "ignores non-existent path, discovers docs/plans/2026-01-01-alpha/" "got: '$out'" ;;
  esac
  \rm -rf "$fx"

  # (e) non-ID_RE dir name -> excluded from discovery, but honored verbatim when
  #     passed explicitly as $ARGUMENTS.
  fx="$(mktemp -d)"
  mkdir -p "$fx/docs/plans/NotAValidId"
  : > "$fx/docs/plans/NotAValidId/research.md"
  # Discovery alone: the non-conforming dir is the only candidate -> tier 3.
  out="$(run_snippet "$snippet" "$fx" "")"
  if [ -n "$out" ]; then
    fail "team-design (e) non-ID_RE excluded" "non-conforming dir excluded from discovery -> prints nothing" "got: '$out'"
  fi
  # Explicit tier-1: same dir passed as $ARGUMENTS is honored verbatim.
  out="$(run_snippet "$snippet" "$fx" "docs/plans/NotAValidId")"
  case "$out" in
    *NotAValidId*) : ;;
    *) fail "team-design (e) explicit honored" "explicit non-ID_RE path honored verbatim (tier 1)" "got: '$out'" ;;
  esac
  \rm -rf "$fx"
fi
\rm -f "$snippet"

# =============================================================================
# EXECUTABLE APPROVAL-GATE (slice 3): extract team-structure's block, run it
# against approval fixtures. Created and torn down in this block.
# =============================================================================
structure_file="$SKILLS/team-structure/SKILL.md"
snippet="$(mktemp)"
extract_sh_block "$structure_file" > "$snippet"

if [ ! -s "$snippet" ]; then
  fail "team-structure executable" "extractable \`\`\`sh discovery block" "no discovery block found in team-structure (extraction empty)"
else
  # Fixture 1: newest dir's design.md is approved:false; older dir is approved:true.
  # Expect the approved (older) dir to win; the unapproved newest is skipped.
  fx="$(mktemp -d)"
  mkdir -p "$fx/docs/plans/2026-01-01-approved" "$fx/docs/plans/2026-01-02-pending"
  printf -- '---\napproved: true\n---\n'  > "$fx/docs/plans/2026-01-01-approved/design.md"
  printf -- '---\napproved: false\n---\n' > "$fx/docs/plans/2026-01-02-pending/design.md"
  touch -t 202601010000 "$fx/docs/plans/2026-01-01-approved/design.md"
  touch "$fx/docs/plans/2026-01-02-pending/design.md"   # newer mtime, but unapproved
  out="$(run_snippet "$snippet" "$fx" "")"
  case "$out" in
    *2026-01-01-approved*) : ;;
    *) fail "team-structure gate skip-unapproved" "resolves docs/plans/2026-01-01-approved/ (skips newer unapproved)" "got: '$out'" ;;
  esac
  \rm -rf "$fx"

  # Fixture 2: the only candidate is unapproved -> prints nothing (tier 3).
  fx="$(mktemp -d)"
  mkdir -p "$fx/docs/plans/2026-01-02-pending"
  printf -- '---\napproved: false\n---\n' > "$fx/docs/plans/2026-01-02-pending/design.md"
  out="$(run_snippet "$snippet" "$fx" "")"
  if [ -n "$out" ]; then
    fail "team-structure gate only-unapproved" "prints nothing (offers /team-design via AskUserQuestion)" "got: '$out'"
  fi
  \rm -rf "$fx"
fi
\rm -f "$snippet"

# =============================================================================
# BLIND-INVARIANT (slices 2 & 6): team-research forwards exactly
# {questions.md, repos.md?} and never task.md / a description; the
# ## Blindness invariant section is intact.
# =============================================================================
research_file="$SKILLS/team-research/SKILL.md"
if [ ! -f "$research_file" ]; then
  fail "team-research blind" "SKILL.md exists" "file not found"
else
  # Isolate the dispatch step (## Execution step 2) to scope the assertions.
  dispatch="$(awk '
    /^2\. Dispatch/    { cap=1 }
    /^3\./             { cap=0 }
    cap                { print }
  ' "$research_file")"

  printf '%s' "$dispatch" | grep -qF 'questions.md' \
    || fail "team-research dispatch" "forwards questions.md" "questions.md absent from dispatch step"
  printf '%s' "$dispatch" | grep -qF 'repos.md' \
    || fail "team-research dispatch" "forwards optional repos.md" "repos.md absent from dispatch step"

  # The dispatch step must NOT widen the forwarded set to task.md or a description.
  if printf '%s' "$dispatch" | grep -qiE 'pass[^.]*task\.md|forward[^.]*task\.md|include[^.]*task\.md'; then
    fail "team-research dispatch" "never forwards task.md to blind agents" "dispatch step appears to pass task.md"
  fi

  grep -qF '## Blindness invariant' "$research_file" \
    || fail "team-research" "## Blindness invariant section present" "section missing"
fi

# =============================================================================
# STANDALONE-PRESERVED (slice 2): team-implement keeps its plan.md-absent
# standalone branch; team-pr keeps archetype-B base detection + the
# "Nothing to ship." standalone stop.
# =============================================================================
implement_file="$SKILLS/team-implement/SKILL.md"
if [ -f "$implement_file" ]; then
  grep -qF 'Standalone mode' "$implement_file" \
    || fail "team-implement standalone" "retains 'Standalone mode' branch" "Standalone mode branch absent"
  grep -qF 'If `$ARGUMENTS/plan.md` does not exist' "$implement_file" \
    || fail "team-implement standalone" "retains plan.md-absent guard" "plan.md-absent guard absent"
else
  fail "team-implement standalone" "SKILL.md exists" "file not found"
fi

pr_file="$SKILLS/team-pr/SKILL.md"
if [ -f "$pr_file" ]; then
  grep -qF 'symbolic-ref refs/remotes/origin/HEAD' "$pr_file" \
    || fail "team-pr archetype-B" "retains base detection (symbolic-ref refs/remotes/origin/HEAD)" "base detection absent"
  grep -qF 'Falls back to `main`' "$pr_file" \
    || fail "team-pr archetype-B" "retains fallback to main" "main fallback absent"
  grep -qF 'Nothing to ship.' "$pr_file" \
    || fail "team-pr standalone" "retains 'Nothing to ship.' standalone stop" "standalone stop absent"
else
  fail "team-pr archetype-B" "SKILL.md exists" "file not found"
fi

# =============================================================================
# ARCHETYPE-D (slice 5): team-question and team-fix drop the bare-stop, add
# repo-context grounding + AskUserQuestion, and keep `gh issue view`.
# =============================================================================
question_file="$SKILLS/team-question/SKILL.md"
if [ -f "$question_file" ]; then
  if grep -qF 'ask the user to describe what they want and stop' "$question_file"; then
    fail "team-question bare-stop" "bare-stop string removed" "bare-stop string still present"
  fi
  grep -qE 'git log|recent git' "$question_file" \
    || fail "team-question grounding" "references recent git activity" "git grounding absent"
  grep -qE 'README|CLAUDE\.md' "$question_file" \
    || fail "team-question grounding" "references README/CLAUDE.md repo context" "README/CLAUDE.md grounding absent"
  grep -qF 'AskUserQuestion' "$question_file" \
    || fail "team-question grounding" "uses AskUserQuestion for genuine gaps" "AskUserQuestion absent"
  grep -qF 'gh issue view' "$question_file" \
    || fail "team-question ticket resolution" "retains 'gh issue view' verbatim" "gh issue view absent"
else
  fail "team-question" "SKILL.md exists" "file not found"
fi

fix_file="$SKILLS/team-fix/SKILL.md"
if [ -f "$fix_file" ]; then
  if grep -qF 'ask the user to describe the bug and stop' "$fix_file"; then
    fail "team-fix bare-stop" "bare-stop string removed" "bare-stop string still present"
  fi
  grep -qE 'git log|recent git' "$fix_file" \
    || fail "team-fix grounding" "references recent git activity" "git grounding absent"
  grep -qE 'README|CLAUDE\.md' "$fix_file" \
    || fail "team-fix grounding" "references README/CLAUDE.md repo context" "README/CLAUDE.md grounding absent"
  grep -qF 'AskUserQuestion' "$fix_file" \
    || fail "team-fix grounding" "uses AskUserQuestion for genuine gaps" "AskUserQuestion absent"
  grep -qF 'gh issue view' "$fix_file" \
    || fail "team-fix ticket resolution" "retains 'gh issue view' verbatim" "gh issue view absent"
else
  fail "team-fix" "SKILL.md exists" "file not found"
fi

# =============================================================================
# RESULT
# =============================================================================
if [ "$ERRORS" -ne 0 ]; then
  printf '\n%s assertion(s) failed.\n' "$ERRORS" >&2
  exit 1
fi
printf '\nAll discovery-consistency assertions passed.\n'
exit 0
