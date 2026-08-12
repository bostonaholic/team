---
name: code-review
description: Generator-evaluator separation and review methodology — loaded by review agents to enforce fresh-context review discipline and gate verdicts; findings from the code, security, and docs reviewers are formatted per the conventional-comments skill. Trigger on "review this diff", "review these changes", "code review this", or "/code-review".
---

# Code Review

Reviews must be performed by agents with fresh context. The generator (the
agent that wrote the code) must never evaluate its own output. This separation
prevents self-evaluation bias — the tendency to see what you intended to write
rather than what you actually wrote.

Write the prose this skill governs at a seventh-grade reading level, in
STE-flavored mode. Full methodology: `skills/writing-prose/SKILL.md`. Apply
its `## Self-lint` checklist before you finalize.

## When Invoked Directly

When a user asks for a review in the main session ("review this diff",
`/code-review`), the session itself is not a valid reviewer — it holds the
conversation history this skill forbids. Do not review inline. Dispatch the
`code-reviewer` agent (or, if unavailable, a fresh read-only subagent
instructed to follow this skill) against the requested diff, then relay its
verdict and findings. Everything below is the methodology that dispatched
reviewer applies.

## Generator-Evaluator Separation

The cardinal rule: **Do not let the same model grade its own exam.**

- Reviewers MUST have fresh context with no shared conversation history.
- Reviewers read the diff and the plan — not the implementation discussion.
- Reviewers form their own understanding of intent from artifacts, not from
  the implementer's explanation.
- A reviewer needing clarification flags it as an open question. It never asks
  the implementer.

## Veto Without Authorship

The separation runs both directions. A reviewer blocks the line and changes
nothing. A producer changes the tree and casts no verdict.

- **You hold no write tool.** Every reviewer agent has read-only tool grants
  and `permissionMode: plan`. Report the defect. Never fix it. A reviewer that
  fixed its own finding would then approve its own fix, collapsing generator
  and evaluator into one role.
- **The veto is bounded.** Your verdict blocks the line for up to 5 rounds; at
  the cap the run halts to a human. Report the finding you actually have — do
  not hold the line on one you cannot support with evidence.

## Conventional Comments

Findings from the code, security, and docs reviewers use the Conventional
Comments format in `skills/conventional-comments/SKILL.md`. The one exception
is the ux-reviewer: its live-verification report uses its own
Working/Broken/Could Improve format.

## Gate Types and Severity Tiers

How each reviewer's verdict gates the pipeline lives in
`skills/review-severity-tiers/SKILL.md` — the gate-type table, the Blocking,
Major, and Minor tiers with the auto-fix boundary, the consult guard, and the
verdict-aggregation rules.

## Verdict Criteria

### Security Reviewer

- **PASS:** No CRITICAL or HIGH findings. MEDIUM/LOW findings are reported but
  do not block.
- **FAIL:** Any CRITICAL or HIGH finding. The pipeline MUST loop back to
  IMPLEMENT. No override.

### Verifier

- **PASS:** All detected checks (format, lint, typecheck, build, test) pass.
- **FAIL:** Any check fails. The pipeline loops back to IMPLEMENT.

### Code Reviewer

- **APPROVE:** All done criteria met, no blocking issues, tests pass.
- **REQUEST CHANGES:** Blocking issues found. The pipeline MUST loop back to
  IMPLEMENT. No override.
- **COMMENT:** Non-blocking suggestions only. Implementation is correct.

**Test-quality flags.** Test files are part of the diff. Walk every changed
`*test*` / `*spec*` / `__tests__/*` file against `skills/test-style/SKILL.md`.
These are `suggestion:` individually and `issue:` when they appear across
multiple tests:

- Change-detector tests — assertions on which collaborator methods were
  called without verifying observable state
- Mock-everything / mock chains where a real or fake equivalent exists
- Full-equality assertions on complex objects when one field carries the
  contract
- Logic in tests (`if`, loops, string-building) that can carry the same bug as
  the code
- Tests named after methods (`testProcessOrder_2`) rather than behaviors
  (`refundsCardOnPartialFailure`)
- DRY helpers that hide the asserted value

**Flaky-test red flags (always blocking).** Distinct from the style flags
above. Any test in the diff whose *outcome depends on* a nondeterministic
input is `issue (blocking)` on **first** occurrence, routing to the Blocking
tier and auto-looping the implementer. A single time-bomb ships a guaranteed
future CI failure, and flakiness erodes the "green means safe" signal. The
rule keys to outcome-dependence, not token presence: a `Date.now()` in a log
line does not flag; one feeding an assertion does. Outcome-dependence covers
the whole suite — state or resources left behind flag because a *later* test's
outcome depends on them. The full catalog lives in
`skills/test-style/SKILL.md` ("Flaky-test red flags (reviewer checklist)").

**Comment red flags.** Check in-source comments in every changed file against
the Code Comments rules in `skills/engineering-standards/SKILL.md`. Findings
cite the checklist item by name and carry the tier's decoration — a
blocking-regime hit reads `issue (blocking): Comment Discipline — ...`. Two
regimes apply:

- **Blocking on first occurrence** — ticket/issue IDs, plan/slice/phase
  markers, and doc-section references in code comments, plus TODO/FIXME
  comments the diff introduces. These checks are mechanical and
  judgment-free, and the references rot.
- **Style escalation** — comments restating WHAT the code does, wordy or
  narrating comments, commented-out code, process narration, comments far
  from the code they explain, vague language ("handle edge case"),
  speculation, duplication of what types/tests/names/docs already carry,
  fragile positional references, style diverging from the repo convention,
  doc comments restating a signature, and a stale comment the diff leaves
  contradicting the changed code. `suggestion:` for a single occurrence,
  `issue:` when repeated. A single what-comment never blocks a round.
  Discriminant for a stale-comment mismatch: when the changed code meets the
  plan's done criteria, the stale comment is the finding; when the code
  diverges from them, raise Correctness instead.
- **Not violations:** upstream-bug links where the link IS the why.
  Ticket-like tokens outside comment syntax — string literals, log messages,
  fixture data (the check reads comments only). Doc comments on
  exported/public interfaces. A pre-existing TODO the diff does not touch. A
  diff with zero comments passes trivially — never manufacture a finding.

  A **missing-why** finding is separate and narrow. Raise it only when the
  diff introduces or rewrites code shaped by a constraint in the
  "Document non-obvious constraints" list *and* you can name the exact
  constraint and the consequence of removing the code. It is
  `suggestion (non-blocking): Comment Discipline`, never blocking, never
  escalating on repetition. Absence of comments is never by itself evidence.

### UX Reviewer

- **APPROVE:** API/UX is intuitive, consistent with existing patterns.
- **REQUEST CHANGES:** Usability issues found. Treated as a *major* —
  auto-fixed in the loop, not surfaced to the user.
- **COMMENT:** Minor ergonomic suggestions (minor-and-below — recorded in the
  PR body's `## Review notes`, never presented mid-run).

### Technical Writer

- **PASS:** Documentation is adequate for the changes made.
- **GAPS:** Documentation gaps identified. Recorded for future work.

## Code Reviewer Inspection Process

1. **Read the diff.** `git diff HEAD~1` (or the applicable range). If the
   scope is unclear, check `git log --oneline -10` first.

2. **Understand the plan.** Look for issue references, commit messages, or a
   plan file describing the done criteria. If none exist, review on general
   correctness and quality.

3. **Review against done criteria.** Verify every done criterion is met. Flag
   any that are missing or incomplete.

   **Then check each rule the diff introduces reaches every surface it must.**
   When the changed code or prose has more than one way in — two entry modes,
   a path documented as usable on its own, a split across turns or processes —
   a new rule added to one is not added to the others by implication. Take
   each rule the diff adds and name where it now holds. A rule present in one
   surface and silently absent from a sibling is a finding; a stated reason
   for the absence answers it. Read a self-contained path **alone**, the way
   its callers arrive at it.

4. **Inspect the code.** For each changed file, check:
   - **Correctness** — off-by-one errors, missing null checks, broken edge
     cases. Does the logic do what it claims?
   - **Maintainability** — intention-revealing names, obvious control flow.
   - **Error handling** — errors caught, surfaced, and handled at the right
     level; failures loud rather than silent.
   - **Comment discipline** — per the Comment red flags above; cite the
     `Comment Discipline` checklist item.
   - **Unnecessary complexity** — abstraction serving no current need.
   - **System fit** — does a sibling implementation now diverge? Does a caller
     outside the diff need updating? Does the change follow conventions
     established elsewhere (cite the convention)? Findings cite the
     `System Fit` checklist item.
   - **SOLID violations** — per `skills/solid-principles/SKILL.md`.
   - **Test files** — per both severity regimes above and
     `skills/test-style/SKILL.md`.

5. **Run tests.** Execute the project's test suite. Report the command used
   and the result.

## Security Review

The security reviewer's process lives in `skills/reviewing-security/SKILL.md`
— attack-surface identification, the OWASP Top 10 checks, the extra
vulnerability checks, and the CRITICAL/HIGH/MEDIUM/LOW severity ladder. The
PASS/FAIL verdict rule stays here (Verdict Criteria above): any CRITICAL or
HIGH finding is FAIL, no override.
