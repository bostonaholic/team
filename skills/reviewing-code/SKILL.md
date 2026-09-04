---
name: reviewing-code
description: 'Defines reviewing code methodology. Load when agents need its procedure.'
user-invocable: false
---

# Reviewing Code

Review with fresh context. The generator never evaluates or fixes its output. Reviewers have
read-only tools and `permissionMode: plan` (`principle-generator-evaluator`, `principle-least-privilege`).
Read [references/review-manual.md](references/review-manual.md).
Apply `writing-prose` and Self-lint before returning the report.

## Report Format

Emit every heading below in order. Use Code Reviewer tokens from Verdict Criteria first. Relay the full report unchanged (`principle-skip-loudly`).

```markdown
**Verdict: <✅ APPROVE | ❌ REQUEST CHANGES | 💬 COMMENT>**

### Summary
<Two to five sentences: scope and verdict reason.>
### Findings
<Conventional Comments with `file:line`, or exactly "No findings.">
### Checks
<Every done criterion and each command/result.>
### Refuted by verification
<Refuted findings, exactly "Nothing refuted.", or "Not run: <reason>.">
### Cross-model disposition
<Per `skills/cross-model-review/SKILL.md`, or "Not run: <reason>.">
```

## Gate Types and Severity Tiers

Load `review-severity-tiers`; it owns gates, tiers, auto-fix, consult, and aggregation.
Findings use `skills/conventional-comments/SKILL.md`; UX uses Working/Broken/Could Improve.

## Verdict Criteria

### Security Reviewer
PASS unless CRITICAL or HIGH exists; either causes FAIL. MEDIUM/LOW findings are reported but do not block.

### Verifier
PASS only when format, lint, typecheck, build, and test pass. Any failure returns to IMPLEMENT.

### Code Reviewer
✅ APPROVE: done criteria met, no blockers, tests pass. ❌ REQUEST CHANGES: a
Blocking issue; return to IMPLEMENT. 💬 COMMENT: only non-blocking suggestions.

**Test-quality flags.** Load `test-style`. One change-detector, mock-chain,
overbroad equality, test logic, method-named test, or opaque helper is `suggestion:`;
repetition across tests is `issue:`.

**Flaky-test red flags (always blocking).** When a test outcome depends on a
nondeterministic input, the first occurrence is `issue (blocking)`. The catalog
lives only in `skills/test-style/SKILL.md`.

**Comment red flags.** Load `engineering-standards`. **Blocking on first occurrence:**
ticket/issue IDs, plan/slice/phase markers, or introduced TODO/FIXME in code comments. **Style escalation:** one occurrence is
`suggestion:`; repeated occurrences are `issue:`. Upstream-bug links whose link
is the reason, string literals, public-interface docs, and untouched TODOs are
not violations. Missing-why is `suggestion (non-blocking)` only when an exact
non-obvious constraint and removal consequence are known.

### UX Reviewer
APPROVE for usable, consistent UX; REQUEST CHANGES for a major; COMMENT for a
minor recorded in PR `## Review notes`.

### Technical Writer
PASS when docs are adequate; GAPS records future documentation work.

## Code Reviewer Inspection Contract

Verify every done criterion, run tests, and check each new rule reaches every surface.
Check Correctness (including off-by-one), maintainability, errors, comments, complexity,
SOLID, and tests. **System fit** checks siblings, outside callers, and conventions. Call the Skill tool with `why` before judging a deliberate guard's removal.

## Security Review

Read `skills/reviewing-security/SKILL.md`; any CRITICAL or HIGH finding is FAIL.
