# Skill Architecture Improvements Plan

**Date:** 2026-03-28
**Research:** docs/plans/2026-03-28-skill-architecture-research-research.md
**Decisions:** docs/plans/2026-03-28-skill-architecture-research-decisions.md

---

## Context

The research phase identified an inconsistency: `adversarial-review/SKILL.md`
exists and is documented in `docs/architecture.md` as loaded by review agents,
but no agent actually loads it. Instead, each reviewer independently duplicates
Conventional Comments format and verdict criteria. The decisions phase produced
four actionable items: wire the skill to 4 agents (D2), document a soft limit
of 3 methodology skills per agent (D7), add precise consumer info to the
methodology table (D5), and document the extraction threshold rationale (D1).

---

## Steps

### Phase 1: Wire `adversarial-review/SKILL.md` to review agents [D2]

Each agent should follow the pattern used by `implementer.md` for
`solid-principles`: reference the skill file, summarize key points inline,
delegate full methodology to the file.

**Step 1.1** `[parallel]` -- Modify `agents/code-reviewer.md`
- Add a load instruction for `skills/adversarial-review/SKILL.md` in the
  review process section, before the existing review steps.
- Summarize inline: generator-evaluator separation, gate type (SOFT), and that
  the full Conventional Comments format, verdict criteria, and aggregation
  rules live in the skill file.
- Remove the duplicated "Comment Format" section (lines 52-62) and the
  duplicated "Verdict" section (lines 64-79). Replace with a brief inline
  summary of the three verdicts (APPROVE, REQUEST CHANGES, COMMENT) that
  references the skill for full criteria.
- Keep the domain-specific review checklist (correctness, maintainability,
  error handling, etc.) -- that is agent-specific, not methodology.
- **Verification:** The file references `skills/adversarial-review/SKILL.md`
  explicitly. No inline definition of Conventional Comments format remains.
  The SOLID principles reference pattern is preserved unchanged.

**Step 1.2** `[parallel]` -- Modify `agents/security-reviewer.md`
- Add a load instruction for `skills/adversarial-review/SKILL.md` after the
  agent introduction paragraph.
- Summarize inline: generator-evaluator separation, gate type (HARD), and that
  the full Conventional Comments format and aggregation rules live in the
  skill file.
- The agent already has its own OWASP-specific report format and severity
  classification -- keep these. They are domain-specific, not duplicated
  methodology.
- Remove only content that duplicates the skill: the verdict PASS/FAIL
  criteria at lines 112 can be shortened to reference the skill for the
  full verdict aggregation logic, but keep the severity table (it is
  security-specific).
- Ensure every finding still uses `file:line` references (already present).
- **Verification:** The file references `skills/adversarial-review/SKILL.md`.
  Security-specific content (OWASP checks, severity classification) is
  preserved.

**Step 1.3** `[parallel]` -- Modify `agents/ux-reviewer.md`
- Add a load instruction for `skills/adversarial-review/SKILL.md` after the
  agent introduction paragraph.
- Summarize inline: generator-evaluator separation, gate type (SOFT), and that
  the full Conventional Comments format, verdict criteria, and aggregation
  rules live in the skill file.
- Keep the UX-specific report format (Working/Broken/Could Improve), detection
  logic, and verification procedures -- these are domain-specific.
- Remove duplicated verdict criteria if any exist inline. Currently `ux-reviewer`
  does not have explicit verdict labels (APPROVE/REQUEST CHANGES/COMMENT), so
  add a brief inline summary referencing the skill for the formal verdict
  format.
- **Verification:** The file references `skills/adversarial-review/SKILL.md`.
  UX-specific verification procedures are preserved.

**Step 1.4** `[parallel]` -- Modify `agents/technical-writer.md`
- Add a load instruction for `skills/adversarial-review/SKILL.md` after the
  agent introduction paragraph.
- Summarize inline: generator-evaluator separation, gate type (ADVISORY), and
  that the full Conventional Comments format and aggregation rules live in the
  skill file.
- Keep the documentation-specific report format (REQUIRED/RECOMMENDED gaps),
  quality assessment section, and writing-prose reference -- these are
  domain-specific.
- Remove duplicated verdict criteria if present. Currently the technical-writer
  uses PASS/GAPS terminology which aligns with `adversarial-review` -- keep
  a brief inline summary and reference the skill for aggregation context.
- **Verification:** The file references `skills/adversarial-review/SKILL.md`.
  The existing `writing-prose` skill reference is preserved. Documentation-
  specific content is preserved.

### Phase 2: Update `docs/architecture.md` [D1, D5, D7]

**Step 2.1** `[sequential]` -- Modify `docs/architecture.md`
- In Section 6 "Methodology" table, update each row's description to name the
  specific agent types that should load it:
  - `rpi-workflow`: "Loaded by router/orchestrator skills"
  - `test-first-development`: "Loaded by test-architect, orchestrator"
  - `adversarial-review`: "Loaded by code-reviewer, security-reviewer,
    ux-reviewer, technical-writer"
  - `systematic-debugging`: "Loaded by agents when debugging"
  - `documenting-decisions`: "Loaded by planner, orchestrator"
- Add a new subsection after the methodology table: "### Design Guidelines"
  containing two items:
  1. **Methodology skill load limit:** Soft limit of 3 methodology skills per
     agent invocation. At ~143 lines average per skill, 3 skills add ~430
     lines (~6K-10K tokens, under 6% of 200K context). A fourth skill signals
     the agent's responsibility may be too broad. This is a design convention,
     not a hard constraint.
  2. **Extraction threshold:** Extract methodology to a separate skill file
     when it forms a coherent, independently maintainable body of knowledge --
     regardless of consumer count. Extraction is justified by swappability,
     independent versioning, and file size (inlining would meaningfully grow
     the consuming file). Do not require 2+ consumers as a prerequisite. The
     threshold is about cohesion and maintainability, not reuse count.
- **Verification:** `docs/architecture.md` contains precise consumer info in
  every methodology skill row. The design guidelines subsection exists with
  both the load limit and extraction threshold documented.

---

## Tests

These are structural acceptance tests -- verified by inspection and grep, not
by a test framework. The project has no test suite for documentation or agent
file structure.

| # | Test | Verifies | Covers |
|---|------|----------|--------|
| T1 | `grep -l "adversarial-review/SKILL.md" agents/code-reviewer.md` returns a match | code-reviewer loads the skill | Step 1.1 |
| T2 | `grep -l "adversarial-review/SKILL.md" agents/security-reviewer.md` returns a match | security-reviewer loads the skill | Step 1.2 |
| T3 | `grep -l "adversarial-review/SKILL.md" agents/ux-reviewer.md` returns a match | ux-reviewer loads the skill | Step 1.3 |
| T4 | `grep -l "adversarial-review/SKILL.md" agents/technical-writer.md` returns a match | technical-writer loads the skill | Step 1.4 |
| T5 | `grep -c "Conventional Comments" agents/code-reviewer.md` returns 1 or fewer (summary only, not a full format definition) | Duplicated format removed from code-reviewer | Step 1.1 |
| T6 | `grep -l "adversarial-review/SKILL.md" agents/verifier.md` returns NO match | verifier excluded (tabular format, not Conventional Comments) | D2 exclusion |
| T7 | `grep "code-reviewer.*security-reviewer.*ux-reviewer.*technical-writer" docs/architecture.md` or equivalent confirms all 4 consumers are named in the adversarial-review row | Methodology table has precise consumers | Step 2.1 |
| T8 | `grep -l "Extraction threshold\|extraction threshold" docs/architecture.md` returns a match | Extraction threshold documented | Step 2.1 |
| T9 | `grep -l "soft limit.*3\|3 methodology skills" docs/architecture.md` returns a match | Load limit guideline documented | Step 2.1 |
| T10 | `grep -l "solid-principles/SKILL.md" agents/implementer.md` still returns a match | Existing skill references not broken | All steps |
| T11 | `grep -l "writing-prose/SKILL.md" agents/technical-writer.md` still returns a match | Existing skill references not broken | Step 1.4 |
| T12 | The dev hook `check-registry-sync.mjs` reports no mismatches (agent frontmatter unchanged) | No registry sync regressions | All steps |

---

## Done Criteria

- [ ] All 4 review agents (`code-reviewer`, `security-reviewer`, `ux-reviewer`,
      `technical-writer`) contain an explicit load instruction for
      `skills/adversarial-review/SKILL.md`
- [ ] `verifier.md` does NOT reference `adversarial-review/SKILL.md`
- [ ] Duplicated Conventional Comments format definitions removed from
      `code-reviewer.md` (replaced with inline summary + skill reference)
- [ ] Each agent retains its domain-specific content (OWASP checks, UX
      verification procedures, documentation gap analysis, SOLID reference)
- [ ] `docs/architecture.md` methodology table names specific consumer agents
      for every methodology skill
- [ ] `docs/architecture.md` contains a design guidelines subsection with the
      3-skill soft limit and extraction threshold rationale
- [ ] No agent frontmatter (`consumes`/`produces`) is modified -- registry
      sync hook reports no mismatches
- [ ] All 12 acceptance tests (T1-T12) pass
- [ ] No regressions in existing agent behavior (frontmatter, tool lists,
      model assignments unchanged)
