#!/usr/bin/env bash
#
# aggregator-helper.sh — deterministic emulation of the review-aggregator
# agent's CONTRACT SURFACE, used exclusively by the dev fixture
# .claude/scripts/check-aggregator-fixture.sh.
#
# This is NOT the production aggregator. The production aggregator is the
# sonnet LLM at agents/review-aggregator.md, driven by methodology in
# skills/review-aggregation/SKILL.md. That LLM emits a free-text synthesis
# that varies run-to-run.
#
# What this helper does is reproduce the **stable substring contract**
# the synthesis must always satisfy:
#   1. "Reviewers consulted: <claude_count> Claude + <ext_pass>/<ext_total> external (...)"
#      header listing each reviewer + their verdict.
#   2. Per-finding "corroborated by N/M" tag where:
#        - N = count of non-SKIP reviewers flagging this (file:line)
#        - M = count of non-SKIP reviewers in the round
#   3. "[single-model — extra scrutiny]" tag when N == 1.
#   4. Findings with file: unknown never carry a corroborated-by tag.
#   5. Verdict line "**Verdict:** PASS | FAIL | SKIP | PARTIAL" on its own line.
#
# Anti-pattern: the fixture asserts ONLY on these stable substrings via
# grep -F. It does not assert on full-text match of free-form prose.
#
# Inputs: one positional arg — the reviews directory path.
# Output: a markdown synthesis on stdout that satisfies the contract.
#
set -uo pipefail

REVIEWS_DIR="${1:-}"
if [ -z "$REVIEWS_DIR" ] || [ ! -d "$REVIEWS_DIR" ]; then
  printf 'aggregator-helper: missing or invalid reviews dir: %s\n' "$REVIEWS_DIR" >&2
  exit 2
fi

# Classify each artifact as external (codex/gemini) vs claude (everything
# else) — matches the skill's reviewer count split.
is_external() {
  case "$1" in
    external-reviewer-*) return 0 ;;
    *) return 1 ;;
  esac
}

# Extract the verdict line from an artifact. Returns the token after
# "**Verdict:**" (PASS | FAIL | SKIP | PARTIAL | REQUEST CHANGES | APPROVE).
artifact_verdict() {
  awk -F'\\*\\*Verdict:\\*\\*' '/\*\*Verdict:\*\*/ {print $2; exit}' "$1" \
    | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
}

# Has the artifact SKIP'd? (verdict token == SKIP)
artifact_is_skip() {
  v="$(artifact_verdict "$1")"
  [ "$v" = "SKIP" ]
}

# Extract the SKIP reason from a SKIP artifact. The wrapper agents
# emit a fixed-form line "SKIP — <reason>" (em-dash) per the SKIP
# template in agents/external-reviewer-{codex,gemini}.md. Returns the
# raw <reason> text trimmed of surrounding whitespace, or the empty
# string when no recognizable reason line is present.
artifact_skip_reason() {
  awk '
    # Match "SKIP" followed by either an em-dash, en-dash, or ASCII
    # hyphen, then capture everything after the separator.
    /^SKIP[[:space:]]*[—–-]/ {
      sub(/^SKIP[[:space:]]*[—–-][[:space:]]*/, "")
      sub(/[[:space:]]+$/, "")
      print
      exit
    }
  ' "$1"
}

# Extract findings as TSV: reviewer<TAB>file:line<TAB>summary
# - file:line comes from the `file:` line in the Conventional Comments block
# - summary is the text after `**issue (...)**:` / `**suggestion ...**:` /
#   `**nitpick ...**:`
# Skips artifacts whose verdict is SKIP.
extract_findings() {
  for f in "$REVIEWS_DIR"/*.md; do
    [ -f "$f" ] || continue
    if artifact_is_skip "$f"; then
      continue
    fi
    reviewer="$(basename "$f" .md)"
    awk -v reviewer="$reviewer" '
      /^\*\*(issue|suggestion|nitpick)/ {
        # capture summary after the colon
        idx = index($0, ":**")
        if (idx > 0) {
          summary = substr($0, idx + 3)
          sub(/^[[:space:]]+/, "", summary)
          sub(/[[:space:]]+$/, "", summary)
        } else {
          summary = $0
        }
        last_summary = summary
        have_summary = 1
        next
      }
      /^file:/ && have_summary {
        file_ref = $0
        sub(/^file:[[:space:]]*/, "", file_ref)
        sub(/[[:space:]]+$/, "", file_ref)
        printf "%s\t%s\t%s\n", reviewer, file_ref, last_summary
        have_summary = 0
        last_summary = ""
      }
    ' "$f"
  done
}

# Build reviewer inventories. For each external reviewer we also
# capture the verdict-or-skip-reason string used in the consulted-
# header parenthetical (codex: ..., gemini: ...). See
# skills/review-aggregation/SKILL.md "Header".
claude_total=0
ext_total=0
ext_pass=0
non_skip_total=0
non_skip_names=""
consulted_lines=""
# Per-CLI display strings — keyed by short cli name (codex|gemini|...)
ext_codex_display=""
ext_gemini_display=""
ext_other_displays=""

for f in "$REVIEWS_DIR"/*.md; do
  [ -f "$f" ] || continue
  reviewer="$(basename "$f" .md)"
  v="$(artifact_verdict "$f")"
  if is_external "$reviewer"; then
    ext_total=$((ext_total + 1))
    # Strip the external-reviewer- prefix to get the CLI tag.
    cli="${reviewer#external-reviewer-}"
    if [ "$v" = "SKIP" ]; then
      reason="$(artifact_skip_reason "$f")"
      [ -z "$reason" ] && reason="SKIP"
      display="$cli: $reason"
    else
      ext_pass=$((ext_pass + 1))
      display="$cli: $v"
    fi
    case "$cli" in
      codex)  ext_codex_display="$display" ;;
      gemini) ext_gemini_display="$display" ;;
      *)      ext_other_displays="${ext_other_displays:+$ext_other_displays, }$display" ;;
    esac
  else
    claude_total=$((claude_total + 1))
  fi
  if [ "$v" != "SKIP" ]; then
    non_skip_total=$((non_skip_total + 1))
    non_skip_names="$non_skip_names $reviewer"
  fi
  consulted_lines="$consulted_lines- $reviewer: $v"$'\n'
done

# Build the parenthetical (codex: ..., gemini: ...[, other: ...]).
# Order is fixed: codex first, then gemini, then any others in the
# order they appeared.
ext_parts=""
[ -n "$ext_codex_display" ]  && ext_parts="$ext_codex_display"
[ -n "$ext_gemini_display" ] && ext_parts="${ext_parts:+$ext_parts, }$ext_gemini_display"
[ -n "$ext_other_displays" ] && ext_parts="${ext_parts:+$ext_parts, }$ext_other_displays"

# Header
printf '## Review Aggregation\n\n'
if [ -n "$ext_parts" ]; then
  printf 'Reviewers consulted: %s Claude + %s/%s external (%s)\n\n' \
    "$claude_total" "$ext_pass" "$ext_total" "$ext_parts"
else
  printf 'Reviewers consulted: %s Claude + %s/%s external\n\n' \
    "$claude_total" "$ext_pass" "$ext_total"
fi
printf '%s\n' "$consulted_lines"

# Group findings by file:line. file:unknown never groups.
findings_tsv="$(extract_findings)"

# Emit findings. Walk unique file:line, count corroborations.
emitted_keys=""
printf '\n## Findings\n\n'
if [ -z "$findings_tsv" ]; then
  printf '(no findings)\n'
else
  while IFS=$'\t' read -r reviewer file_ref summary; do
    [ -z "$reviewer" ] && continue
    # de-dup by file:line — first reviewer wins as the emitted summary;
    # but file:unknown always emits separately (one per occurrence) and
    # never corroborates.
    if [ "$file_ref" = "unknown" ]; then
      printf -- '---\n'
      printf '**issue:** %s\n' "$summary"
      printf 'file: unknown\n'
      printf 'originating: %s\n' "$reviewer"
      printf '\n'
      continue
    fi
    # Skip if we already emitted this file:line
    case " $emitted_keys " in
      *" $file_ref "*) continue ;;
    esac
    emitted_keys="$emitted_keys $file_ref"
    # Count how many distinct non-SKIP reviewers flagged this file:line
    n=$(printf '%s\n' "$findings_tsv" | awk -F'\t' -v key="$file_ref" '$2 == key {print $1}' | sort -u | wc -l | tr -d ' ')
    printf -- '---\n'
    printf '**issue:** %s\n' "$summary"
    printf 'file: %s\n' "$file_ref"
    printf 'originating: %s\n' "$reviewer"
    if [ "$n" -ge 2 ]; then
      printf 'corroborated by %s/%s\n' "$n" "$non_skip_total"
    else
      printf '[single-model — extra scrutiny]\n'
    fi
    printf '\n'
  done <<< "$findings_tsv"
fi

# Verdict: FAIL if any non-SKIP reviewer's verdict was FAIL or
# REQUEST CHANGES; PASS otherwise. (Hard-gate verdicts preserved
# verbatim — this helper does NOT downgrade them.)
verdict="PASS"
for f in "$REVIEWS_DIR"/*.md; do
  [ -f "$f" ] || continue
  v="$(artifact_verdict "$f")"
  case "$v" in
    FAIL|"REQUEST CHANGES") verdict="FAIL"; break ;;
  esac
done

printf '\n**Verdict:** %s\n' "$verdict"
