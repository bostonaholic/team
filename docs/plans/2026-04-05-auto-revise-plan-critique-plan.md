# Plan: Auto-Revise Plan on Critical/Major Critique Findings

## Context

When the plan-critic returns a REVISE verdict, the router currently presents the plan to the user at the human gate with all findings visible. This wastes the user's time reviewing plans with known design flaws. This plan adds an auto-revision loop: REVISE verdicts trigger automatic `plan.revision-requested` events (up to 3 total rounds) before the human gate, so the user only sees plans that have already incorporated critic feedback. Research artifact: `docs/plans/2026-04-05-auto-revise-plan-critique-research.md`.

## Steps

### Phase 1: Replace Human Gate section in SKILL.md [atomic commit]

This is a single-file change. The entire modification lives in `skills/team/SKILL.md`, lines 100-118 (the "Human Gate (plan approval)" section). No other files change.

**Step 1.1** `[sequential]` -- Add auto-revision loop before human gate presentation

- **File:** `skills/team/SKILL.md`
- **What:** Replace lines 100-118 (the full "### Human Gate (plan approval)" section) with new content that adds an auto-revision pre-pass before the existing human gate logic. The new section must contain, in order:

  1. **Section heading:** `### Human Gate (plan approval)` (unchanged)

  2. **Auto-revision pre-pass** (new content, before the existing numbered steps):
     - When `plan.critiqued` is recorded, check the verdict field
     - The verdict field is the sole driver of the auto-revision decision (no separate defensive rule -- a conforming critic always produces REVISE when critical findings exist)
     - If verdict is REVISE:
       a. Count all `plan.revision-requested` events in the event log
       b. If count < 3: **auto-revise** -- construct a `feedback` string by reading the critique artifact and extracting the `### CRITICAL` and `### MAJOR` sections from the critic's markdown output (the critic produces markdown prose, not a structured JSON array). If neither section is found in the critique output (degenerate case: REVISE with only minor/nitpick issues), include the full critique text as feedback. Append a `plan.revision-requested` event with `{planPath, feedback, revisionNumber: <count + 1>}`. The planner consumes this, produces a new `plan.drafted`, the critic re-reviews, and the loop continues.
       c. If count >= 3: **safety valve** -- fall through to the human gate below. The budget is 3 total `plan.revision-requested` events in the log (both auto-revisions and user rejections count). Present the plan with all findings plus an additional note: "Auto-revision exhausted (3 attempts). The plan critic still recommends revision."
     - If verdict is PASS or PASS WITH CHANGES: proceed directly to the human gate presentation below (no auto-revision)

  3. **Human gate presentation** (existing logic, renumbered and adjusted):
     - Same numbered steps 1-5 as current lines 102-118, but now they only execute for PASS, PASS WITH CHANGES, or safety-valve-exhausted REVISE
     - Step 1: Read the plan artifact and the critique from the event data
     - Step 2: Present the plan artifact in full. Filter critique display by verdict:
       - **PASS** -- Show verdict and `### Verified` section only
       - **PASS WITH CHANGES** -- Show verdict, MAJOR findings, and `### Verified` section
       - **REVISE (safety valve)** -- Show all findings with the warning: "The plan critic recommends revision. Auto-revision was attempted 3 times but the critic still found critical/major issues. Approving means shipping with known design concerns. Are you sure?"
     - Step 3: Ask: "Do you approve this plan?"
     - Step 4: If approved, append `plan.approved` event (include critic verdict in event data)
     - Step 5: If rejected, append `plan.revision-requested` event with user feedback

- **Verification:**
  - The section follows the same prose structure as the Interview Gate (lines 83-98): read field, compare to threshold, auto-emit or interact
  - `plan.revision-requested` payload matches the schema in `docs/event-catalog.md`: `{planPath, feedback, revisionNumber}`
  - The `revisionNumber` is derived by counting events, not stored as mutable state
  - No changes to `registry.json` -- gate type stays `"human"`
  - No changes to any agent frontmatter
  - Existing PASS and PASS WITH CHANGES behavior is preserved verbatim
  - No defensive CRITICAL escalation rule -- the verdict field alone drives auto-revision
  - Feedback is extracted from critique markdown (### CRITICAL, ### MAJOR sections), not from a structured JSON array
  - Safety valve counts total `plan.revision-requested` events (auto + user), not just auto-revisions
  - Fallback: if REVISE verdict but no CRITICAL/MAJOR markdown sections found, full critique text used as feedback

## Tests

These are acceptance criteria expressed as testable conditions. Since the change is to a prose skill file (not executable code), verification is structural inspection of the SKILL.md content.

| # | Test Name | Verifies | Step |
|---|-----------|----------|------|
| AR-1 | `auto_revision_loop_exists_before_human_presentation` | The Human Gate section contains an auto-revision pre-pass that checks verdict before presenting to user | 1.1 |
| AR-2 | `revise_verdict_triggers_auto_emit` | When verdict is REVISE and revision count < 3, the section instructs router to append `plan.revision-requested` without user interaction | 1.1 |
| AR-3 | `feedback_extracted_from_critique_markdown` | The auto-revision feedback is extracted from `### CRITICAL` and `### MAJOR` markdown sections of the critic's output (not from a structured JSON issues array) | 1.1 |
| AR-4 | `feedback_fallback_on_missing_sections` | When verdict is REVISE but no `### CRITICAL` or `### MAJOR` sections are found in the critique, the full critique text is used as feedback | 1.1 |
| AR-5 | `revision_count_derived_from_event_log` | Revision count is derived by counting all `plan.revision-requested` events in the log (both auto and user) | 1.1 |
| AR-6 | `safety_valve_at_three_total_revisions` | When 3 or more total `plan.revision-requested` events exist in the log, auto-revision stops and falls through to user presentation | 1.1 |
| AR-7 | `safety_valve_shows_exhaustion_note` | Safety valve presentation includes note about 3 failed auto-revision attempts | 1.1 |
| AR-8 | `pass_verdict_skips_auto_revision` | PASS verdict goes directly to human gate presentation (no auto-revision) | 1.1 |
| AR-9 | `pass_with_changes_skips_auto_revision` | PASS WITH CHANGES verdict goes directly to human gate presentation | 1.1 |
| AR-10 | `plan_revision_requested_payload_matches_schema` | Auto-emitted event uses `{planPath, feedback, revisionNumber}` matching event-catalog.md | 1.1 |
| AR-11 | `existing_pass_presentation_preserved` | PASS verdict still shows only verdict + Verified section | 1.1 |
| AR-12 | `existing_pass_with_changes_presentation_preserved` | PASS WITH CHANGES still shows verdict + MAJOR findings + Verified section | 1.1 |
| AR-13 | `verdict_is_sole_auto_revision_driver` | No defensive CRITICAL escalation rule exists -- only the verdict field determines whether auto-revision triggers | 1.1 |
| AR-14 | `no_registry_changes` | `skills/team/registry.json` is unmodified (gate type remains `"human"`) | 1.1 |
| AR-15 | `no_agent_frontmatter_changes` | No agent `.md` files have modified `consumes`/`produces` frontmatter | 1.1 |
| AR-16 | `only_skill_file_modified` | The only file modified is `skills/team/SKILL.md` | 1.1 |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Planner produces identical plan on revision, wasting 3 loops | Low | Low | Max-3 safety valve bounds the cost; critic should give different feedback each round since the plan is the same |
| Ambiguous prose causes router to misinterpret auto-revision logic | Medium | Medium | Follow the interview gate pattern exactly (read field, compare threshold, auto-emit); keep prose imperative and step-numbered |
| Registry sync hook flags false positive | Low | Low | No registry or agent changes, so the hook should not fire |
| Safety valve REVISE warning confuses user vs. normal REVISE | Low | Medium | Distinct wording ("Auto-revision exhausted") differentiates from a first-time REVISE |
| REVISE verdict with only minor/nitpick findings yields empty feedback | Low | Medium | Fallback: use full critique text when no CRITICAL/MAJOR sections found |

## Done Criteria

- [ ] `skills/team/SKILL.md` Human Gate section contains auto-revision pre-pass before human presentation
- [ ] REVISE verdict with < 3 total prior revisions triggers automatic `plan.revision-requested` (no user interaction)
- [ ] Feedback string extracted from `### CRITICAL` and `### MAJOR` markdown sections of critique output (not from structured JSON)
- [ ] Fallback: full critique text used as feedback when REVISE but no CRITICAL/MAJOR sections found
- [ ] Revision budget is 3 total `plan.revision-requested` events in log (auto + user combined)
- [ ] Safety valve triggers at >= 3 total revisions, falls through to user with exhaustion note
- [ ] PASS and PASS WITH CHANGES flow unchanged (go directly to human gate)
- [ ] No defensive CRITICAL escalation rule -- verdict field is sole driver of auto-revision decision
- [ ] `plan.revision-requested` payload matches `{planPath, feedback, revisionNumber}` schema
- [ ] No changes to `registry.json`, agent frontmatter, or any file other than `skills/team/SKILL.md`
- [ ] No regressions: registry sync hook passes, existing pipeline behavior for non-REVISE verdicts unaffected
