---
name: reviewing-code
description: 'Defines reviewing code methodology. Load when agents need its procedure.'
user-invocable: false
---

# Reviewing Code

Reviews must be performed by agents with fresh context. The generator (the
agent that wrote the code) must never evaluate its own output.

Write the prose this skill governs at a seventh-grade reading level, in
STE-flavored mode. Full methodology: `writing-prose`. Call the Skill tool
with `writing-prose` and apply its `## Self-lint` checklist before you
finalize.

## Generator-Evaluator Separation

- Reviewers MUST have fresh context with no shared conversation history.
- Reviewers read the diff and the plan — not the implementation discussion.
- Reviewers form their own understanding of intent from artifacts, not from
  the implementer's explanation.
- A reviewer needing clarification flags it as an open question. It never asks
  the implementer.

The cross-gate canon lives at `principle-generator-evaluator`;
this skill owns the code-review application.

## Veto Without Authorship

Block the line, change nothing
(`principle-generator-evaluator`).

- **You hold no write tool.** Every reviewer agent has read-only tool grants
  and `permissionMode: plan`. Report the defect. Never fix it.
  The constraint is the withheld tool, not a request for restraint
  (`principle-least-privilege`).
- **The veto holds until the finding is resolved.** Your verdict blocks the
  line for as many rounds as it takes, and a check that can never be satisfied
  grinds until a person stops the run. Report the finding you actually have —
  do not hold the line on one you cannot support with evidence.

## Conventional Comments

Format follows the artifact. A **finding** — from the code, security, or
docs reviewer — uses the Conventional Comments format in
`skills/conventional-comments/SKILL.md`. A **live-verification report**, which
is what the ux-reviewer produces, uses its own Working/Broken/Could Improve
format.

## Report Format

One report shape binds every surface a code review crosses: the
code-reviewer's final report, the report a subagent returns when it
reviews a diff on a dispatcher's behalf, and the full output the top-level
session presents after a direct invocation. A relay reproduces the report
in full — never a paraphrase, never a subset. A reviewer that carries its
own report template in its agent file (the security-reviewer, the
ux-reviewer, the technical-writer, the verifier) keeps it; this shape
governs the code review.

```markdown
**Verdict: <✅ APPROVE | ❌ REQUEST CHANGES | 💬 COMMENT>**

### Summary

<What was reviewed — the diff or range — and why the verdict. Two to
five sentences.>

### Findings

<One finding per entry, Blocking tier first. Exactly "No findings."
when there are none.>

### Checks

<Each done criterion, met or not met. The test-suite command and its
result. Any other check run, with its result.>

### Refuted by verification

<Findings the skeptic pass refuted. Exactly "Nothing refuted." when the
pass ran and refuted none. Exactly "Not run: <reason>." when it did not
run.>

### Cross-model disposition

<The cross-model pass's per-round record, built per
`skills/cross-model-review/SKILL.md`. Exactly "Not run: <reason>." when
that pass did not run.>
```

- **The verdict line comes first.** The orchestrator parses it. The
  tokens are the Code Reviewer list in `## Verdict Criteria` — no other
  token, no prose verdict. Each token carries its standard emoji prefix
  (✅ APPROVE, ❌ REQUEST CHANGES, 💬 COMMENT); the word token, not the
  emoji, is what the orchestrator matches on.
- `### Findings` entries use the Conventional Comments format
  (`## Conventional Comments` above), each with its `file:line`
  reference.
- **The output format is not a choice.** Emit all five headings, in the
  order the template gives them, on every report. Invent no section,
  rename none, move none, and drop none. Two reports of the same diff
  differ in what their sections say and never in which sections they
  have.
- **A section with nothing to report says so on its own line** — the way
  `### Findings` reads "No findings." when there are none. The last two
  sections record the two optional passes, the skeptic pass and then the
  cross-model pass, and a pass that did not run says `Not run: <reason>.`
  in its section. This is where "skip loudly" lands in the report.
  What did not happen is reported as visibly as what did (`principle-skip-loudly`).
- **A receiver reports a deviation. It never repairs one.** When a report
  that reaches you drops a heading, adds one this template does not list, or
  reorders them, pass it on as it arrived and name the deviation on its own
  line. This binds every surface named above — the relay after a direct
  invocation, and a dispatcher folding in what a subagent returned. A
  receiver that quietly reshapes a report becomes a second place the shape
  is decided, and then it is no longer one shape.

## Gate Types and Severity Tiers

Call the Skill tool with `review-severity-tiers`. It owns how each reviewer's
verdict gates the pipeline: the gate-type table, the Blocking,
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

- **✅ APPROVE:** All done criteria met, no blocking issues, tests pass.
- **❌ REQUEST CHANGES:** Blocking issues found. The pipeline MUST loop back to
  IMPLEMENT. No override.
- **💬 COMMENT:** Non-blocking suggestions only. Implementation is correct.

**Test-quality flags.** Test files are part of the diff. Walk every changed
`*test*` / `*spec*` / `__tests__/*` file against the rules in `test-style` —
call the Skill tool with `test-style`.
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
the Code Comments rules in `engineering-standards` — call the Skill tool with
`engineering-standards`. Findings
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

## Code Reviewer Inspection Contract

Your input is the diff on the current branch (`git diff HEAD~1`, or the
range the orchestrator names; `git log --oneline -10` when the scope is
unclear) and the done criteria in whatever plan file, issue references, or
commit messages the branch carries. When no criteria exist, review on
general correctness and quality. Order the work however you judge best.
Three obligations are non-negotiable:

- **Verify every done criterion is met.** Flag any that are missing or
  incomplete.
- **Run the project's test suite.** Report the command used and the result.
- **Check each rule the diff introduces reaches every surface it must.**
  When the changed code or prose has more than one way in — two entry modes,
  a path documented as usable on its own, a split across turns or processes —
  a new rule added to one is not added to the others by implication. Take
  each rule the diff adds and name where it now holds. A rule present in one
  surface and silently absent from a sibling is a finding; a stated reason
  for the absence answers it. Read a self-contained path **alone**, the way
  its callers arrive at it.

**Coverage checklist** — every changed file is checked against every item;
no order implied:

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
  `System Fit` checklist item. When the diff removes or weakens
  long-standing behavior — a guard, a threshold, a workaround that looks
  deliberate — check its rationale before flagging or approving the
  removal: call the Skill tool with `why`. A Chesterton's-fence deletion
  whose motivating constraint still holds is a finding; one whose
  constraint provably evaporated is not.
- **SOLID violations** — per `skills/solid/SKILL.md`.
- **Test files** — per both severity regimes above and
  `skills/test-style/SKILL.md`.

## Security Review

The security reviewer's process lives in `skills/reviewing-security/SKILL.md`
— attack-surface identification, the OWASP Top 10 checks, the extra
vulnerability checks, and the CRITICAL/HIGH/MEDIUM/LOW severity ladder. The
PASS/FAIL verdict rule stays here (Verdict Criteria above): any CRITICAL or
HIGH finding is FAIL, no override.
