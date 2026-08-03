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
STE-flavored mode — short sentences, common words, no unexplained jargon.
Before you finalize prose this skill governs, run the `## Self-lint` in
that file. Full methodology: `skills/writing-prose/SKILL.md`.

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

- Reviewers MUST have fresh context with no shared conversation history
- Reviewers read the diff and the plan — not the implementation discussion
- Reviewers form their own understanding of intent from artifacts, not from
  the implementer's explanation
- If a reviewer needs clarification, they flag it as an open question — they
  do not ask the implementer

This separation is enforced structurally by dispatching review agents as
independent subagents with no access to the orchestrator's conversation.

## Veto Without Authorship

The separation runs in both directions. A reviewer blocks the line and changes
nothing. A producer changes the tree and casts no verdict. Neither role can
close a review cycle alone.

- **You hold no write tool.** Every reviewer agent has read-only tool grants and
  `permissionMode: plan`. This is a property of the harness, not a rule you must
  remember. Report the defect. Never fix it.
- **A reviewer that fixed its own finding would then approve its own fix.** That
  collapses the generator and the evaluator into one role, which is the exact
  failure this whole layer exists to prevent.
- **The veto is bounded.** Your verdict blocks the line for up to 5 rounds. At
  the cap the run halts to a human. Report the finding you actually have. Do not
  hold the line on a finding you cannot support with evidence.

## Conventional Comments

Findings from the code, security, and docs reviewers use the Conventional
Comments format. The label and decoration syntax, the comment style, and the
three comment types (issue, suggestion, nitpick) live in
`skills/conventional-comments/SKILL.md`. The one exception is the
ux-reviewer: its live-verification report uses its own Working/Broken/Could
Improve format instead.

## Gate Types and Severity Tiers

How each reviewer's verdict gates the pipeline lives in
`skills/review-severity-tiers/SKILL.md`. That skill carries the gate-type
table, the Blocking, Major, and Minor severity tiers with the auto-fix
boundary, the consult guard, and the verdict-aggregation rules.

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
  IMPLEMENT. No override — quality issues must be resolved before shipping.
- **COMMENT:** Non-blocking suggestions only. Implementation is correct.

**Test-quality flags.** Test files are part of the diff. Walk every changed
`*test*` / `*spec*` / `__tests__/*` file against the rules in
`skills/test-style/SKILL.md` ("Test Style Rules"). The
following anti-patterns are `suggestion:` individually and `issue:` when
they appear across multiple tests:

- Change-detector tests — assertions on which collaborator methods were
  called without verifying observable state
- Mock-everything / mock chains — mocks for collaborators that have a
  real or fake equivalent
- Full-equality assertions on complex objects when one field carries the
  contract
- Logic in tests (`if`, loops, string-building) that can carry the same
  bug as the code
- Tests named after methods (`testProcessOrder_2`) rather than behaviors
  (`refundsCardOnPartialFailure`)
- DRY helpers that hide the asserted value

**Flaky-test red flags (always blocking).** These are distinct from the
style flags above. Any test in the diff whose *outcome depends on* a
nondeterministic input is `issue (blocking)` on **first** occurrence. It
routes to the Blocking tier and auto-loops the implementer. A single
time-bomb ships a guaranteed future CI failure. Flakiness erodes the "green
means safe" signal. The rule keys to outcome-dependence, not token presence:
a `Date.now()` in a log line does not flag. One feeding an assertion does.
Outcome-dependence covers the whole suite, not only the offending test:
state or resources left behind flag because a *later* test's outcome depends
on them, even when the offending test's own result is deterministic. The
full red-flag catalog — time/date dependence and time-bombs (with the
canonical bad/good example pair), fixed sleeps, race interleavings,
test-order dependence, unseeded randomness, real network, resource leaks and
hard-coded ports, unordered-collection order assumptions, exact float
equality, and platform dependence — lives in `skills/test-style/SKILL.md`
("Flaky-test red flags (reviewer checklist)").

**Comment red flags.** Check the in-source comments in every changed file
against the Code Comments rules in `skills/engineering-standards/SKILL.md`.
Findings cite the checklist item by name and carry the tier's decoration —
a blocking-regime hit reads `issue (blocking): Comment Discipline — ...`.
Two severity regimes apply:

- **Blocking on first occurrence** — an `issue (blocking)` finding, like the
  flaky-test red flags. It covers ticket/issue IDs, plan/slice/phase
  markers, and doc-section references in code comments. The check is
  mechanical and judgment-free, and the references rot — the tracker
  migrates, the plan is deleted, the section is renumbered, and the comment
  becomes a lie. TODO/FIXME comments in delivered code join this bucket for
  the same reason: equally mechanical to detect, and hard-banned by the
  canonical standard — deferred work belongs in the implementer's report,
  not the code.
- **Style escalation:** comments that restate WHAT the code does, wordy or
  narrating comments, and commented-out code obey the same regime as the
  test-quality style flags. That is `suggestion:` for a single occurrence,
  and `issue:` when repeated across the diff. A single what-comment never
  blocks a round on its own. The same regime covers the judgment classes
  from the expanded canonical set. Flag process narration — historical,
  edit, or conversation narration. Flag comments far from the code they
  explain. Flag vague language ("handle edge case"). Flag speculation or
  an invented motive. Flag duplication of what types, tests, names, or
  docs already carry. Flag fragile positional references — line numbers
  or file layout. Flag comment style that diverges from the repo
  convention. Flag doc comments that restate a signature or sit on
  internal implementation. Flag a stale comment the diff leaves
  contradicting the changed code. Discriminant for that mismatch: when
  the changed code meets the plan's done criteria, the stale comment is
  the finding. When the code diverges from the done criteria, raise
  Correctness instead. With no plan, default to the comment as the
  finding.
- **Not violations:** upstream-bug links where the link IS the why (a
  workaround pointing at a public issue URL). Ticket-like tokens outside
  comment syntax — string literals, log messages, test fixture data (the
  check reads comments only). Doc comments on exported/public interfaces per
  the ecosystem's convention. A diff with zero comments passes trivially —
  never manufacture a finding.

  The comment-text checks read comments only. A diff with zero comments
  passes them trivially — never manufacture a comment-text finding. A
  missing-why finding is separate and narrow. Raise it only when both
  conditions hold. First, the diff introduces or rewrites code whose
  behavior is shaped by a constraint in the Document non-obvious
  constraints list, or by a deliberate oddity. Second, you can name the
  exact constraint and the consequence of removing or simplifying the
  code. It is a
  `suggestion (non-blocking): Comment Discipline` finding. It never
  carries the `issue (blocking)` decoration, never forces a REQUEST
  CHANGES verdict, and never escalates on repetition. The absence of
  comments is never by itself evidence. When in doubt, stay silent. A
  missing doc comment on a new public contract is not licensed by this
  gate. That half is enforced at authoring time by the canonical
  standard, not by the reviewer.

  A pre-existing TODO or FIXME — one already in the file before this
  diff — is not the diff's violation. The blocking TODO/FIXME entry
  covers comments the diff introduces. When the change resolves the
  TODO's subject, delete the comment as obsolete. When the change does
  not touch it, leave it alone and raise no finding.

### UX Reviewer

- **APPROVE:** API/UX is intuitive, consistent with existing patterns.
- **REQUEST CHANGES:** Usability issues found. Treated as a *major* — auto-fixed
  in the loop, not surfaced to the user.
- **COMMENT:** Minor ergonomic suggestions (minor-and-below — recorded in
  the PR body's `## Review notes`, never presented mid-run).

### Technical Writer

- **PASS:** Documentation is adequate for the changes made.
- **GAPS:** Documentation gaps identified. Recorded for future work.

## Code Reviewer Inspection Process

1. **Read the diff.** Run `git diff HEAD~1` (or the applicable range) to see
   what changed. If the scope is unclear, check `git log --oneline -10`
   first.

2. **Understand the plan.** Look for issue references, commit messages, or a
   plan file that describes the done criteria. If none exist, review based on
   general correctness and quality.

3. **Review against done criteria.** If a plan exists, verify every done
   criterion is met by the implementation. Flag any that are missing or
   incomplete.

4. **Inspect the code.** For each changed file, check:
   - **Correctness** — Does the logic do what it claims? Are there off-by-one
     errors, missing null checks, or broken edge cases?
   - **Maintainability** — Can a new developer understand this in 5 minutes?
     Are names intention-revealing? Is the control flow obvious?
   - **Error handling** — Are errors caught, surfaced, and handled at the right
     level? Are failures silent when they should be loud?
   - **Naming clarity** — Do variable, function, and module names communicate
     intent without requiring comments?
   - **Comment discipline** — Check the in-source comments in every changed
     file per the Comment red flags check above (Code Reviewer verdict
     section); cite the `Comment Discipline` checklist item.
   - **Unnecessary complexity** — Is there abstraction that serves no current
     need? Are there simpler ways to achieve the same result?
   - **System fit** — Does a sibling implementation now diverge? Does a
     caller or consumer outside the diff need updating? Does the change
     follow the conventions established elsewhere in the codebase (cite the
     convention)? Findings cite the `System Fit` checklist item by name.
   - **SOLID violations** — Check for design principle violations using the
     methodology in `skills/solid-principles/SKILL.md`:
     - SRP: does this unit have more than one reason to change?
     - OCP: does adding new behavior require modifying this existing code?
     - LSP: do subtypes honor the base type's full contract?
     - ISP: does this interface force clients to depend on unused methods?
     - DIP: does business logic instantiate its own infrastructure dependencies?
   - **Test files** — Walk every changed `*test*` / `*spec*` /
     `__tests__/*` file against both severity regimes above (Code Reviewer
     verdict section) and the style rules in
     `skills/test-style/SKILL.md`. Style flags escalate: a
     single occurrence is a `suggestion:`; multiple occurrences across the
     diff become `issue:`. Flaky-test red flags are blocking `issue:`
     findings on **first** occurrence.

5. **Run tests.** Execute the project's test suite to verify tests pass. Report
   the command used and the result.

## Security Review

The security reviewer's step-by-step process lives in
`skills/reviewing-security/SKILL.md`. That skill carries attack-surface
identification, the OWASP Top 10 checks, the extra vulnerability checks, and
the CRITICAL/HIGH/MEDIUM/LOW severity classification ladder. The PASS/FAIL
verdict rule stays here (Verdict Criteria, "Security Reviewer" above): any
CRITICAL or HIGH finding is FAIL, no override.
