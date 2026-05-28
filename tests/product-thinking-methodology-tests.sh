#!/usr/bin/env bash
# Acceptance tests for the product-thinking methodology skill and its wiring
# into the three pre-implementation agents (questioner, design-author,
# structure-planner).
#
# These are structural/mechanical checks: there is no runtime test framework
# for skills, so each "test" greps the Markdown for the contract that the
# structure (docs/plans/2026-05-27-make-something-people-want/structure.md)
# declares — file starts with ---, frontmatter schema, the five ordered H2
# headings, the four lenses, pure-lens shape, line count, the skills: wiring,
# the per-role body directives, and the no-dangling-reference cross-check.
#
# Each test prints PASS or FAIL with its description.
# Exit code is non-zero if any test fails.
# Run from the repository root: bash tests/product-thinking-methodology-tests.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0

pass() {
  echo "PASS  $1"
}

fail() {
  echo "FAIL  $1"
  FAILURES=$((FAILURES + 1))
}

SKILL_FILE="$REPO_ROOT/skills/product-thinking/SKILL.md"
QUESTIONER="$REPO_ROOT/agents/questioner.md"
DESIGN_AUTHOR="$REPO_ROOT/agents/design-author.md"
STRUCTURE_PLANNER="$REPO_ROOT/agents/structure-planner.md"

# ===========================================================================
# SLICE 1: The product-thinking skill
# ===========================================================================

# ---------------------------------------------------------------------------
# T1: skill file exists and starts with YAML frontmatter (---)
#     Proves the only hard mechanical gate (post-write-validate.mjs:50-55).
# ---------------------------------------------------------------------------
if [ -f "$SKILL_FILE" ] && [ "$(head -1 "$SKILL_FILE")" = "---" ]; then
  pass "T1: skill file exists and first line is ---"
else
  fail "T1: skill file exists and first line is --- (file missing or does not start with frontmatter)"
fi

# ---------------------------------------------------------------------------
# T2: frontmatter name matches the directory: name: product-thinking
# ---------------------------------------------------------------------------
if [ -f "$SKILL_FILE" ] && head -10 "$SKILL_FILE" | grep -q "^name: product-thinking$"; then
  pass "T2: frontmatter declares name: product-thinking"
else
  fail "T2: frontmatter declares name: product-thinking (matching the directory)"
fi

# ---------------------------------------------------------------------------
# T3: frontmatter description names all three loaders
#     (questioner, design-author, structure-planner) per the template.
# ---------------------------------------------------------------------------
T3_PASS=true
if [ -f "$SKILL_FILE" ]; then
  DESC_BLOCK=$(head -10 "$SKILL_FILE" | grep "^description:" || true)
  for loader in "questioner" "design-author" "structure-planner"; do
    if ! echo "$DESC_BLOCK" | grep -q "$loader"; then
      T3_PASS=false
    fi
  done
else
  T3_PASS=false
fi

if [ "$T3_PASS" = "true" ]; then
  pass "T3: description names all three loaders (questioner, design-author, structure-planner)"
else
  fail "T3: description names all three loaders (questioner, design-author, structure-planner)"
fi

# ---------------------------------------------------------------------------
# T4: frontmatter is exactly name + description — no agent-only fields
#     (argument-hint, model, tools, permissionMode). Inspect only the
#     frontmatter block (between the first two --- lines).
# ---------------------------------------------------------------------------
T4_PASS=true
if [ -f "$SKILL_FILE" ]; then
  FRONTMATTER=$(awk 'NR==1 && $0=="---"{f=1;next} f && $0=="---"{exit} f{print}' "$SKILL_FILE")
  for forbidden in "^argument-hint:" "^model:" "^tools:" "^permissionMode:"; do
    if echo "$FRONTMATTER" | grep -q "$forbidden"; then
      T4_PASS=false
    fi
  done
  echo "$FRONTMATTER" | grep -q "^name:" || T4_PASS=false
  echo "$FRONTMATTER" | grep -q "^description:" || T4_PASS=false
else
  T4_PASS=false
fi

if [ "$T4_PASS" = "true" ]; then
  pass "T4: frontmatter is exactly name + description (no argument-hint/model/tools/permissionMode)"
else
  fail "T4: frontmatter is exactly name + description (no argument-hint/model/tools/permissionMode)"
fi

# ---------------------------------------------------------------------------
# T5: the five H2 headings exist verbatim AND in order:
#     ## Core Lenses, ## When Framing the Task, ## When Designing,
#     ## When Slicing, ## Lens, Not Dogma.
#     The three "When ..." names are a contract consumed by slices 2-4.
# ---------------------------------------------------------------------------
EXPECTED_H2=$'## Core Lenses\n## When Framing the Task\n## When Designing\n## When Slicing\n## Lens, Not Dogma'
if [ -f "$SKILL_FILE" ]; then
  ACTUAL_H2=$(grep '^## ' "$SKILL_FILE" || true)
else
  ACTUAL_H2=""
fi

if [ "$ACTUAL_H2" = "$EXPECTED_H2" ]; then
  pass "T5: the five H2 headings exist verbatim and in order"
else
  fail "T5: the five H2 headings exist verbatim and in order (got: $(echo "$ACTUAL_H2" | tr '\n' '|'))"
fi

# ---------------------------------------------------------------------------
# T6: H1 title "# Product Thinking" present
# ---------------------------------------------------------------------------
if [ -f "$SKILL_FILE" ] && grep -q "^# Product Thinking$" "$SKILL_FILE"; then
  pass "T6: H1 title is # Product Thinking"
else
  fail "T6: H1 title is # Product Thinking"
fi

# ---------------------------------------------------------------------------
# T7: all four named lenses are present (assert on their key phrases).
#     1. Demand evidence over assertion
#     2. Smallest thing people want
#     3. Build for someone specific
#     4. Talk-to-users mindset
# ---------------------------------------------------------------------------
T7_PASS=true
if [ -f "$SKILL_FILE" ]; then
  grep -qi "Demand evidence" "$SKILL_FILE" || T7_PASS=false
  grep -qi "Smallest thing" "$SKILL_FILE" || T7_PASS=false
  grep -qi "someone specific" "$SKILL_FILE" || T7_PASS=false
  grep -qi "Talk-to-users\|talk to users" "$SKILL_FILE" || T7_PASS=false
else
  T7_PASS=false
fi

if [ "$T7_PASS" = "true" ]; then
  pass "T7: all four named lenses are present"
else
  fail "T7: all four named lenses are present (demand evidence, smallest thing, someone specific, talk-to-users)"
fi

# ---------------------------------------------------------------------------
# T8 (edge: goal-isolation contract lives in the skill).
#     The ## When Framing the Task section must scope its questions to the
#     goal-isolated questioner — name who it's for and what signal shows demand,
#     without nudging goal inference.
#     Structural proxy: the skill mentions a demand signal and "specifically".
# ---------------------------------------------------------------------------
T8_PASS=true
if [ -f "$SKILL_FILE" ]; then
  grep -qi "specifically" "$SKILL_FILE" || T8_PASS=false
  grep -qi "signal" "$SKILL_FILE" || T8_PASS=false
  grep -qi "smallest version" "$SKILL_FILE" || T8_PASS=false
else
  T8_PASS=false
fi

if [ "$T8_PASS" = "true" ]; then
  pass "T8: ## When Framing the Task carries the demand-signal / smallest-version framing questions"
else
  fail "T8: ## When Framing the Task carries the demand-signal / smallest-version framing questions"
fi

# ---------------------------------------------------------------------------
# T9 (edge: lens-not-dogma closer present).
#     The skill must close with the anti-ceremony caution so it does not read
#     as a gate (design Decision 5; Edge case "Empty/trivial task").
# ---------------------------------------------------------------------------
if [ -f "$SKILL_FILE" ] && grep -q "^## Lens, Not Dogma$" "$SKILL_FILE"; then
  pass "T9: Lens, Not Dogma closer is present"
else
  fail "T9: Lens, Not Dogma closer is present"
fi

# ---------------------------------------------------------------------------
# T10: pure-lens shape — NO ## Overview / ## Summary heading
#      (design Decision 5: pure lens, no scaffolding sections).
# ---------------------------------------------------------------------------
T10_PASS=true
if [ -f "$SKILL_FILE" ]; then
  grep -qiE "^## (Overview|Summary)$" "$SKILL_FILE" && T10_PASS=false
else
  T10_PASS=false
fi

if [ "$T10_PASS" = "true" ]; then
  pass "T10: pure-lens shape — no ## Overview / ## Summary heading"
else
  if [ ! -f "$SKILL_FILE" ]; then
    fail "T10: pure-lens shape — no ## Overview / ## Summary heading (skill file missing)"
  else
    fail "T10: pure-lens shape — found a forbidden ## Overview / ## Summary heading"
  fi
fi

# ---------------------------------------------------------------------------
# T11: pure-lens shape — NO checklist / gate / self-check heading
#      (design Decision 5: no numbered gate, no blocking self-check).
# ---------------------------------------------------------------------------
T11_PASS=true
if [ -f "$SKILL_FILE" ]; then
  grep -qiE "^## .*(Checklist|Gate|Self-check|Self check)" "$SKILL_FILE" && T11_PASS=false
else
  T11_PASS=false
fi

if [ "$T11_PASS" = "true" ]; then
  pass "T11: pure-lens shape — no checklist / gate / self-check heading"
else
  if [ ! -f "$SKILL_FILE" ]; then
    fail "T11: pure-lens shape — no checklist / gate / self-check heading (skill file missing)"
  else
    fail "T11: pure-lens shape — found a forbidden checklist / gate / self-check heading"
  fi
fi

# ---------------------------------------------------------------------------
# T12: file length is within the soft norm (<= 175 lines)
#      (design Conventions 4 / Edge case "Over-length skill").
# ---------------------------------------------------------------------------
if [ -f "$SKILL_FILE" ]; then
  LINE_COUNT=$(wc -l < "$SKILL_FILE" | tr -d ' ')
  if [ "$LINE_COUNT" -le 175 ]; then
    pass "T12: skill is within the <= 175 line soft norm ($LINE_COUNT lines)"
  else
    fail "T12: skill is within the <= 175 line soft norm (found $LINE_COUNT lines, expected <= 175)"
  fi
else
  fail "T12: skill is within the <= 175 line soft norm (skill file missing)"
fi

# ===========================================================================
# SLICE 2: Wire the questioner
# ===========================================================================

# ---------------------------------------------------------------------------
# T13: questioner frontmatter gains a skills: block listing product-thinking.
#      Inspect only the frontmatter block (between the first two --- lines).
# ---------------------------------------------------------------------------
QUESTIONER_FM=$(awk 'NR==1 && $0=="---"{f=1;next} f && $0=="---"{exit} f{print}' "$QUESTIONER")
if echo "$QUESTIONER_FM" | grep -q "^skills:" \
  && echo "$QUESTIONER_FM" | grep -qE "product-thinking|team:product-thinking"; then
  pass "T13: questioner frontmatter has a skills: block listing product-thinking"
else
  fail "T13: questioner frontmatter has a skills: block listing product-thinking"
fi

# ---------------------------------------------------------------------------
# T14: questioner body directive cites its role section ## When Framing the Task.
#      The directive lives in the body (after the closing frontmatter ---),
#      not in the frontmatter.
# ---------------------------------------------------------------------------
QUESTIONER_BODY=$(awk 'NR==1 && $0=="---"{f=1;next} f && $0=="---"{f=0;b=1;next} b{print}' "$QUESTIONER")
if echo "$QUESTIONER_BODY" | grep -q "## When Framing the Task" \
  && echo "$QUESTIONER_BODY" | grep -qi "product-thinking\|product-need lens"; then
  pass "T14: questioner body directive cites ## When Framing the Task"
else
  fail "T14: questioner body directive cites ## When Framing the Task (in the body, not frontmatter)"
fi

# ---------------------------------------------------------------------------
# T15 (edge: goal isolation preserved). The questioner directive must restate
#      the goal-isolation constraint and scope itself to task.md framing, so it
#      cannot nudge goal inference or leak into questions.md.
#      The property is asserted on the directive block itself (anchored on the
#      product-need-lens directive plus its continuation lines), so it verifies
#      the lens directive, not unrelated prose elsewhere in the body.
# ---------------------------------------------------------------------------
QUESTIONER_DIRECTIVE=$(echo "$QUESTIONER_BODY" | grep -iA4 "Apply the product-need lens\|product-thinking" || true)
T15_PASS=true
if echo "$QUESTIONER_DIRECTIVE" | grep -qiE "questions\.md|never"; then
  : # goal-isolation restated inside the directive
else
  T15_PASS=false
fi
if echo "$QUESTIONER_DIRECTIVE" | grep -qiE "task\.md|framing"; then
  : # scoped to task.md framing inside the directive
else
  T15_PASS=false
fi

if [ "$T15_PASS" = "true" ]; then
  pass "T15: questioner directive restates goal isolation and scopes to task.md framing"
else
  fail "T15: questioner directive restates goal isolation and scopes to task.md framing"
fi

# ---------------------------------------------------------------------------
# T16: questioner description frontmatter is unchanged (not overwritten by the
#      directive). The original description must still be intact verbatim.
# ---------------------------------------------------------------------------
QUESTIONER_DESC_EXPECTED="description: Use as the first agent of the QRSPI pipeline. Decomposes a user's task description into a full task record (task.md) and neutral research questions (questions.md), and — when the description names more than one repository — a repos.md listing the repos the topic touches. The researcher who reads questions.md should have no idea what feature is being built."
if grep -qF "$QUESTIONER_DESC_EXPECTED" "$QUESTIONER"; then
  pass "T16: questioner description frontmatter is unchanged"
else
  fail "T16: questioner description frontmatter is unchanged (directive must live in body, not overwrite description)"
fi

# ===========================================================================
# SLICE 3: Wire the design-author
# ===========================================================================

# ---------------------------------------------------------------------------
# T17: design-author frontmatter gains a skills: block listing product-thinking.
# ---------------------------------------------------------------------------
DESIGN_AUTHOR_FM=$(awk 'NR==1 && $0=="---"{f=1;next} f && $0=="---"{exit} f{print}' "$DESIGN_AUTHOR")
if echo "$DESIGN_AUTHOR_FM" | grep -q "^skills:" \
  && echo "$DESIGN_AUTHOR_FM" | grep -qE "product-thinking|team:product-thinking"; then
  pass "T17: design-author frontmatter has a skills: block listing product-thinking"
else
  fail "T17: design-author frontmatter has a skills: block listing product-thinking"
fi

# ---------------------------------------------------------------------------
# T18: design-author body directive cites its role section ## When Designing.
# ---------------------------------------------------------------------------
DESIGN_AUTHOR_BODY=$(awk 'NR==1 && $0=="---"{f=1;next} f && $0=="---"{f=0;b=1;next} b{print}' "$DESIGN_AUTHOR")
if echo "$DESIGN_AUTHOR_BODY" | grep -q "## When Designing" \
  && echo "$DESIGN_AUTHOR_BODY" | grep -qi "product-thinking\|product-need lens"; then
  pass "T18: design-author body directive cites ## When Designing"
else
  fail "T18: design-author body directive cites ## When Designing (in the body, not frontmatter)"
fi

# ---------------------------------------------------------------------------
# T19 (edge: no manufactured ceremony). The design-author directive must add
#      no gate and require no extra research — it informs judgment only
#      (design Decisions 2, 5; Out of scope "no new gate").
#      Structural proxy asserted on the directive block itself: it states it
#      adds no gate / requires no extra research.
# ---------------------------------------------------------------------------
DESIGN_AUTHOR_DIRECTIVE=$(echo "$DESIGN_AUTHOR_BODY" | grep -iA4 "Apply the product-need lens\|product-thinking" || true)
if echo "$DESIGN_AUTHOR_DIRECTIVE" | grep -qiE "no gate|adds no gate|no extra research|requires no"; then
  pass "T19: design-author directive states it adds no gate / no extra research"
else
  fail "T19: design-author directive states it adds no gate / no extra research"
fi

# ---------------------------------------------------------------------------
# T20: design-author description frontmatter is unchanged.
# ---------------------------------------------------------------------------
DESIGN_AUTHOR_DESC_EXPECTED="description: Use after research is complete to align with the user on the approach before any code is written. Drafts a ~200-line design document covering current state, desired end state, patterns to follow, decisions made, and explicit open questions for the user. MUST present the open questions interactively before producing the design — replaces the RPI \"magic words\" problem with structural interaction."
if grep -qF "$DESIGN_AUTHOR_DESC_EXPECTED" "$DESIGN_AUTHOR"; then
  pass "T20: design-author description frontmatter is unchanged"
else
  fail "T20: design-author description frontmatter is unchanged (directive must live in body, not overwrite description)"
fi

# ===========================================================================
# SLICE 4: Wire the structure-planner
# ===========================================================================

# ---------------------------------------------------------------------------
# T21: structure-planner frontmatter gains a skills: block listing product-thinking.
# ---------------------------------------------------------------------------
STRUCTURE_PLANNER_FM=$(awk 'NR==1 && $0=="---"{f=1;next} f && $0=="---"{exit} f{print}' "$STRUCTURE_PLANNER")
if echo "$STRUCTURE_PLANNER_FM" | grep -q "^skills:" \
  && echo "$STRUCTURE_PLANNER_FM" | grep -qE "product-thinking|team:product-thinking"; then
  pass "T21: structure-planner frontmatter has a skills: block listing product-thinking"
else
  fail "T21: structure-planner frontmatter has a skills: block listing product-thinking"
fi

# ---------------------------------------------------------------------------
# T22: structure-planner body directive cites its role section ## When Slicing.
# ---------------------------------------------------------------------------
STRUCTURE_PLANNER_BODY=$(awk 'NR==1 && $0=="---"{f=1;next} f && $0=="---"{f=0;b=1;next} b{print}' "$STRUCTURE_PLANNER")
if echo "$STRUCTURE_PLANNER_BODY" | grep -q "## When Slicing" \
  && echo "$STRUCTURE_PLANNER_BODY" | grep -qi "product-thinking\|product-need lens"; then
  pass "T22: structure-planner body directive cites ## When Slicing"
else
  fail "T22: structure-planner body directive cites ## When Slicing (in the body, not frontmatter)"
fi

# ---------------------------------------------------------------------------
# T23 (edge: lens informs, never blocks). The structure-planner directive must
#      nudge slice-1-ships-value and cutting scope to the smallest wanted
#      thing, adding no new gate (design Decision 5; Out of scope).
#      Structural proxy asserted on the directive block itself: it mentions
#      slice 1 shipping value / smallest scope and that it adds no gate.
# ---------------------------------------------------------------------------
STRUCTURE_PLANNER_DIRECTIVE=$(echo "$STRUCTURE_PLANNER_BODY" | grep -iA4 "Apply the product-need lens\|product-thinking" || true)
T23_PASS=true
if echo "$STRUCTURE_PLANNER_DIRECTIVE" | grep -qiE "slice 1|smallest"; then
  : # nudges slice-1-ships-value / smallest scope
else
  T23_PASS=false
fi
if echo "$STRUCTURE_PLANNER_DIRECTIVE" | grep -qiE "no new gate|no gate|adds no"; then
  : # adds no gate
else
  T23_PASS=false
fi

if [ "$T23_PASS" = "true" ]; then
  pass "T23: structure-planner directive nudges slice-1-value / smallest scope and adds no gate"
else
  fail "T23: structure-planner directive nudges slice-1-value / smallest scope and adds no gate"
fi

# ---------------------------------------------------------------------------
# T24: structure-planner description frontmatter is unchanged.
# ---------------------------------------------------------------------------
STRUCTURE_PLANNER_DESC_EXPECTED="description: Use after the design is approved to break the work into vertical slices with verification checkpoints. Each slice is end-to-end (touches every layer needed to deliver one piece of functionality), independently testable, and atomically committable. Produces a ~2-page document the human reviews before any code is written."
if grep -qF "$STRUCTURE_PLANNER_DESC_EXPECTED" "$STRUCTURE_PLANNER"; then
  pass "T24: structure-planner description frontmatter is unchanged"
else
  fail "T24: structure-planner description frontmatter is unchanged (directive must live in body, not overwrite description)"
fi

# ===========================================================================
# CROSS-SLICE: no dangling section references (Section-name contract)
# ===========================================================================

# ---------------------------------------------------------------------------
# T25: every ## When ... heading cited by the three agents resolves to a real
#      heading in the skill. Closes the design "Section-name drift" coupling.
#      The three cited names (When Framing the Task, When Designing,
#      When Slicing) must each appear as an ## heading in the skill file.
# ---------------------------------------------------------------------------
T25_PASS=true
if [ -f "$SKILL_FILE" ]; then
  for heading in "## When Framing the Task" "## When Designing" "## When Slicing"; do
    # The heading is cited by an agent...
    CITED=false
    for agent in "$QUESTIONER" "$DESIGN_AUTHOR" "$STRUCTURE_PLANNER"; do
      if grep -qF "$heading" "$agent"; then
        CITED=true
      fi
    done
    # ...and must resolve to a real H2 in the skill.
    if [ "$CITED" = "true" ]; then
      grep -qF "$heading" "$SKILL_FILE" || T25_PASS=false
    else
      # If no agent cites it yet, the contract is not wired — fail.
      T25_PASS=false
    fi
  done
else
  T25_PASS=false
fi

if [ "$T25_PASS" = "true" ]; then
  pass "T25: every ## When ... heading cited by the agents resolves to a real skill heading"
else
  fail "T25: every ## When ... heading cited by the agents resolves to a real skill heading (dangling reference or missing wiring)"
fi

# ===========================================================================
# Summary
# ===========================================================================
echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo "All tests passed."
  exit 0
else
  echo "$FAILURES test(s) failed."
  exit 1
fi
