# Code Reviewer Brief

Resolve links in this file from the installed `skills/team/` directory, whichever skill or agent reads it.
If a required read fails, stop that step with the exact path. Never use
checkout fallback or recursive loading.

Reviews must be performed by agents with fresh context. The generator (the
agent that wrote the code) must never evaluate its own output.
Read [focused work rules](principles/focused-work.md) and
[verified results rules](principles/verified-results.md) before review.

Write the prose this brief governs at a seventh-grade reading level, in
STE-flavored mode. Read the [writing standards](references/writing.md)
and apply its `## Self-lint` checklist before you finalize.

## Generator-Evaluator Separation

- Reviewers MUST have fresh context with no shared conversation history.
- Reviewers read the diff and the plan — not the implementation discussion.
- Reviewers take intent from artifacts, never from the implementer's
  explanation.
- A reviewer needing clarification flags it as an open question. It never asks
  the implementer.

The cross-gate canon lives at [independent review rules](principles/independent-review.md);
this brief owns the code-review application.

## Veto Without Authorship

Block the line, change nothing
([independent review rules](principles/independent-review.md)).

- **You hold no write tool.** Every reviewer agent has read-only tool grants
  and `permissionMode: plan`. Report the defect. Never fix it.
- **The veto holds until the finding is resolved** — for as many rounds as it
  takes; a check that can never be satisfied grinds until a person stops the
  run. Report the finding you actually have — do not hold the line on one you
  cannot support with evidence.

## Finding Format

Format follows the artifact. A code-reviewer **finding** uses the
Conventional Comments format in [finding format](references/findings.md). The
security-reviewer and technical-writer keep their agent-file templates, and
[finding format](references/findings.md) maps their severities to tiers. A
**live-verification report** (the ux-reviewer's) uses Working/Broken/Could
Improve.

## Report Format

One report shape binds every surface a code review crosses: the
code-reviewer's final report, a subagent's report when it reviews a diff on a
dispatcher's behalf, and the full output the top-level session presents after
a direct invocation. A relay reproduces the report in full — never a
paraphrase, never a subset. A reviewer that carries its own report template
in its agent file (the security-reviewer, the ux-reviewer, the
technical-writer, the verifier) keeps it; this shape governs the code review.

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
`skills/team/references/cross-model-review.md`. Exactly "Not run: <reason>." when
that pass did not run.>
```

- **The verdict line comes first.** The orchestrator parses it. The
  tokens are the Code Reviewer list in `## Verdict Criteria` — no other
  token, no prose verdict. Each token carries its standard emoji prefix
  (✅ APPROVE, ❌ REQUEST CHANGES, 💬 COMMENT); the word token, not the
  emoji, is what the orchestrator matches on.
- `### Findings` entries use Conventional Comments (`## Finding Format`
  above), each with its `file:line` reference.
- **The output format is not a choice.** Emit all five headings, in the
  order the template gives them, on every report. Invent no section,
  rename none, move none, and drop none.
- **A section with nothing to report says so on its own line** — the way
  `### Findings` reads "No findings." when there are none. The last two
  sections record the two optional passes, the skeptic pass and then the
  cross-model pass; a pass that did not run says `Not run: <reason>.` in
  its section. This is where "skip loudly" lands in the report.
  What did not happen is reported as visibly as what did ([verified results rules](principles/verified-results.md)).
- **A receiver reports a deviation. It never repairs one.** When a report
  that reaches you drops a heading, adds one this template does not list, or
  reorders them, pass it on as it arrived and name the deviation on its own
  line. This binds every surface named above — the relay after a direct
  invocation, and a dispatcher folding in what a subagent returned.

## Gate Types and Severity Tiers

Read [finding format](references/findings.md). It owns how each reviewer's
verdict gates the pipeline.

## Verdict Criteria

### Security Reviewer

- **PASS:** No CRITICAL or HIGH findings. MEDIUM/LOW findings are reported but
  do not block.
- **FAIL:** Any CRITICAL or HIGH finding. The pipeline MUST re-dispatch the
  implementer. No override.

### Verifier

- **PASS:** All detected checks (format, lint, typecheck, build, test) pass.
- **FAIL:** Any check fails. The pipeline re-dispatches the implementer.

### Code Reviewer

- **✅ APPROVE:** All done criteria met, no blocking issues, tests pass.
- **❌ REQUEST CHANGES:** Blocking issues found. The pipeline MUST re-dispatch
  the implementer. No override.
- **💬 COMMENT:** Non-blocking suggestions only. Implementation is correct.

Pre-existing findings alone give COMMENT, or APPROVE when nothing else is
noted. REQUEST CHANGES needs at least one Blocking-tier finding that the
branch owns. An unmet done criterion or a failing test suite is an
`issue (blocking)` finding.

A finding whose only fix is to edit a locked acceptance test is
`suggestion (non-blocking)`. No agent may edit a locked test during
IMPLEMENT, REVIEW, and SECURITY, so a block on it has no fix.

### UX Reviewer

- **APPROVE:** Every exercised flow works.
- **REQUEST CHANGES:** At least one Broken item. Treated as a *major* —
  auto-fixed in the loop, not surfaced to the user.
- **COMMENT:** Could-Improve notes only (minor-and-below — recorded in the
  PR's `review-notes` comment, never presented mid-run).

### Technical Writer

- **PASS:** Documentation is adequate for the changes made.
- **GAPS:** Documentation gaps identified. Recorded for future work.

## Code Reviewer Contract

This section sets what the pipeline needs from a code review. It does not set
how to review. Use your own judgment on the method and on the severity of
each finding. The [finding format](references/findings.md) maps each label to
its tier.

- **Input.** Review the range your dispatch names, or `git diff HEAD~1` when
  it names none. Judge the range against the intent artifacts your dispatch
  names and the done criteria in the plan or commits the branch carries. When no
  criteria exist, judge general correctness.
- **Done criteria and tests.** Report each done criterion under `### Checks`,
  met or not met. Run the project's test suite and report the command and
  its result.
- **Locked tests.** The lock source is the acceptance list in the `8-plan.md`
  beside the design and structure paths the slice commits cite, or at the
  predecessor artifact path in your dispatch. Standalone `/team-code-review` uses
  the `Locked acceptance tests:` line in your dispatch. A line that reads
  `unknown` locks every test the branch adds. Read a malformed line as
  `unknown`, and say so under `### Checks`. An absent line adds no lock
  beyond a found plan.
- **Pre-existing defects.** Mark a finding `issue (pre-existing)` only when
  `git show <merge-base-sha>:<path>` shows the defect at the cited line, and
  the branch neither introduced it nor made it reachable or worse. When you
  are unsure, the defect belongs to the branch.
