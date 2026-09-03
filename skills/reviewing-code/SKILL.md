---
name: reviewing-code
description: Review a diff with fresh context and return Team's exact evidence-backed verdict format.
user-invocable: false
---

# Reviewing Code

Review with fresh context. The producer never evaluates its own work
(`skills/principle-generator-evaluator/SKILL.md`). Apply `writing-prose` in
STE-flavored mode and run its `## Self-lint` before finalizing.

## Reviewer boundary

- Read the diff and artifacts, not the implementation discussion.
- Form intent from evidence. Record ambiguity; never ask the implementer.
- Hold no write tool and make no fix. Report the defect
  (`skills/principle-least-privilege/SKILL.md`).
- Keep a veto only while supported by evidence.
- Format code, security, and docs findings with
  `skills/conventional-comments/SKILL.md`. UX uses its live-verification form.

## Report Format

This exact shape governs the code-reviewer report, a fallback subagent's
report, and the top-level relay:

```markdown
**Verdict: <token from Verdict Criteria>**

### Summary

<Reviewed range and verdict reason, two to five sentences.>

### Findings

<Blocking first; one Conventional Comment with file:line per entry. Exactly
"No findings." when empty.>

### Checks

<Each done criterion and result; test command/result; every other check run.>

### Refuted by verification

<Refuted skeptic findings. "Nothing refuted." when none. "Not run: <reason>."
when skipped.>

### Cross-model disposition

<Record from `skills/cross-model-review/SKILL.md`. "Not run: <reason>." when
skipped.>
```

The verdict line is first and uses the emoji-prefixed token in Verdict
Criteria. Emit all five headings in this order; add, rename, reorder, or omit
none. A receiver relays a malformed report unchanged and names the deviation
separately; it never repairs the report. This is the visible skip record
(`skills/principle-skip-loudly/SKILL.md`).

## Gate and Verdict Criteria

Call the Skill tool with `review-severity-tiers`; it alone maps findings to
pipeline action.

### Security Reviewer

- **PASS:** No CRITICAL or HIGH findings. MEDIUM/LOW findings are reported but
  do not block.
- **FAIL:** Any CRITICAL or HIGH finding; loop to IMPLEMENT with no override.

### Verifier

- **PASS:** Every detected format, lint, typecheck, build, and test check passes.
- **FAIL:** Any check fails; loop to IMPLEMENT.

### Code Reviewer

- **✅ APPROVE:** Done criteria met, no blocking issue, tests pass.
- **❌ REQUEST CHANGES:** Any blocking issue; loop to IMPLEMENT with no override.
- **💬 COMMENT:** Non-blocking findings only; implementation is correct.

**Test-quality flags.** Load `test-style` and inspect every changed test. One
instance is `suggestion:`; repetition across tests is `issue:`:

- collaborator-call assertions without observable-state verification
- mock-everything or mock chains when a real/fake equivalent exists
- full equality on complex objects when one field is the contract
- test logic (`if`, loops, value-building) that can repeat the production bug
- method-shaped names instead of behavior names
- DRY helpers that hide the asserted value

**Flaky-test red flags (always blocking).** When any test outcome depends on a
nondeterministic input, report `issue (blocking)` on the **first** occurrence.
This includes leaked state/resources that affect a later test. Token presence
alone is insufficient. The sole catalog is
`skills/test-style/SKILL.md` ("Flaky-test red flags (reviewer checklist)").

**Comment red flags.** Load `engineering-standards`; cite `Comment Discipline`.

- **Blocking on first occurrence:** ticket/issue IDs,
  plan/slice/phase markers, or doc-section references in code comments; a
  TODO/FIXME introduced by the diff.
- **Style escalation:** WHAT-restating, wordy/narrating, commented-out,
  process, distant, vague, speculative, duplicative, positional,
  convention-breaking, signature-restating, or stale comments. Use
  `suggestion:` once and `issue:` when repeated. If changed code violates a
  done criterion, report Correctness instead of its stale comment.
- **Allowed:** an upstream-bug link that is the why; ticket-like tokens in
  string literals, logs, or fixtures; public-interface doc comments; untouched existing
  TODOs. Zero comments means zero comment findings.
- **Missing why:** only when new/changed code encodes a named non-obvious
  constraint whose removal has a concrete consequence. Always
  `suggestion (non-blocking): Comment Discipline`; never escalate.

### UX Reviewer

- **APPROVE:** UX/API is intuitive and matches existing patterns.
- **REQUEST CHANGES:** usability Major; auto-fix.
- **COMMENT:** Minor note for the PR body.

### Technical Writer

- **PASS:** documentation is adequate.
- **GAPS:** record documentation gaps for future work.

## Code Reviewer Inspection Contract

Input is the named diff/range and its done criteria. If scope is unclear, use
`git log --oneline -10`; if no criteria exist, review general correctness and
quality.

Required actions:

1. Verify every done criterion.
2. Run the project's test suite and report command/result.
3. Check each new rule reaches every surface it must. For multiple entry modes,
   standalone paths, turns, or processes, name where the rule holds. Read a
   self-contained path alone. Unexplained sibling asymmetry is a finding.
4. Inspect every changed file for:

   - **Correctness** — off-by-one, null handling, edge paths, claimed behavior.
   - **Maintainability** — revealing names and direct control flow.
   - **Error handling** — failures caught, surfaced, and handled at the owner.
   - **Comment discipline** — apply the split regime above.
   - **Unnecessary complexity** — abstraction with no current need.
   - **System fit** — sibling divergence, affected caller outside the diff,
     or conflict with an established convention. Cite `System Fit`. Before
     approving removal of a long-standing guard/threshold/workaround, load
     `why`; flag it only if its motivating constraint still holds.
   - **SOLID** — apply `skills/solid/SKILL.md`.
   - **Tests** — apply both test severity regimes above.

## Done

Return the exact report format. The security process is owned by
`skills/reviewing-security/SKILL.md`; this skill owns only its PASS/FAIL gate.
