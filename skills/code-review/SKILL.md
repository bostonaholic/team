---
name: code-review
description: Generator-evaluator separation and review methodology — loaded by review agents to enforce fresh-context review discipline and gate verdicts; findings are formatted per the conventional-comments skill
---

# Code Review

Reviews must be performed by agents with fresh context. The generator (the
agent that wrote the code) must never evaluate its own output. This separation
prevents self-evaluation bias — the tendency to see what you intended to write
rather than what you actually wrote.

Write the prose your review comments carry at a seventh-grade reading
level — short sentences, common words, no unexplained jargon. Full
methodology: `skills/writing-prose/SKILL.md`.

## Generator-Evaluator Separation

The cardinal rule: **Don't let the same model grade its own exam.**

- Reviewers MUST have fresh context with no shared conversation history
- Reviewers read the diff and the plan — not the implementation discussion
- Reviewers form their own understanding of intent from artifacts, not from
  the implementer's explanation
- If a reviewer needs clarification, they flag it as an open question — they
  do not ask the implementer

This separation is enforced structurally by dispatching review agents as
independent subagents with no access to the orchestrator's conversation.

## Conventional Comments

Every finding uses the Conventional Comments format — the label and
decoration syntax, comment style, and the three comment types (issue,
suggestion, nitpick) live in `skills/conventional-comments/SKILL.md`.

## Gate Types and Severity Tiers

How each reviewer's verdict gates the pipeline — the gate-type table, the
Blocking/Major/Minor severity tiers with the auto-fix boundary, the consult
guard, and the verdict-aggregation rules — lives in
`skills/review-severity-tiers/SKILL.md`.

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
`skills/test-first-development/SKILL.md` ("Test Style Rules"). The
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

**Flaky-test red flags (always blocking).** Distinct from the style flags
above: any test in the diff whose *outcome depends on* a nondeterministic
input is `issue (blocking)` on **first** occurrence — it routes to the
Blocking tier and auto-loops the implementer. A single time-bomb ships a
guaranteed future CI failure; flakiness erodes the "green means safe"
signal. The rule keys to outcome-dependence, not token presence: a
`Date.now()` in a log line does not flag; one feeding an assertion does.
Outcome-dependence covers the whole suite, not only the offending test:
state or resources left behind flag because a *later* test's outcome
depends on them, even when the offending test's own result is deterministic.

- **Time/date dependence, incl. time-bombs** — `new Date()`, `Date.now()`,
  `datetime.now()` feeding an assertion; a future date literal in a fixture
  (`expiresAt: "2030-01-01"`, cert `notAfter`); naive calendar arithmetic
  on "now" (`addMonths`, month-end/DST/leap assumptions); TZ-naive date
  construction. Past/fixed date literals with an explicit TZ do not flag.
- **Fixed-sleep / timed waits** — `sleep()` for synchronization:
  `Thread.sleep(ms)`, `setTimeout`-as-wait, `cy.wait(3000)`,
  `page.waitForTimeout(...)`; a bounded wait whose success is asserted
  (`assertTrue(latch.await(100, MS))` — a capped wait still flags).
  Tests legitimately about time require a frozen/fake clock — a real
  sleep to observe a delay still flags.
- **Concurrency / race interleaving** — assertions assuming a completion
  order across threads, `Promise.all`, or executors; shared state mutated
  without synchronization; missing `join()`/`await` before asserting.
  Order-independent assertions (`Set` comparison, sorted) do not flag.
- **Test-order dependence & shared mutable state** — static/module-level
  mutable state written by a test; state (DB row, file, env var) created
  with no teardown; a test reading state another test produced.
- **Unseeded randomness** — `Math.random()`, `uuid.v4()`, `faker.*` without
  `faker.seed(n)` feeding an assertion. Seeded randomness does not flag.
- **Real network / external services** — live URLs or SDK clients in a test
  with no stub/interceptor at the boundary.
- **Resource leaks & hard-coded ports** — a fixed port for an embedded
  server/DB (collides under parallel CI); an opened connection, file, or
  socket with no guaranteed teardown.
- **Unordered-collection order assumptions** — positional assertions on
  hash map/set iteration or on a query with no `ORDER BY`.
- **Exact float equality** — `expect(0.1 + 0.2).toBe(0.3)`; require a
  tolerance/epsilon comparison.
- **Platform/environment dependence** — hard-coded path separators or line
  endings; locale/TZ formatting asserted against a fixed string; CPU-count
  or CI-parallelism assumptions.

**Time-bomb example** (a rerun never exposes it — only the diff does):

**Bad:**
```js
// Bad — wall-clock read feeds the assertion; hard-coded future expiry.
// Green today, permanently red once the clock crosses the literal.
const token = { expiresAt: "2030-01-01" };
expect(isValid(token, new Date())).toBe(true);
```

**Good:**
```js
// Good — frozen/injected clock; expiry derived from it.
const now = new Date("2024-06-15T12:00:00Z");
const token = issueToken({ now, ttlDays: 30 });
expect(isValid(token, now)).toBe(true);
```

**Comment red flags.** Check the in-source comments in every changed file
against the Code Comments rules in `skills/engineering-standards/SKILL.md`.
Findings cite the checklist item by name: `issue: Comment Discipline — ...`.
Two severity regimes apply:

- **Blocking on first occurrence:** ticket/issue IDs,
  plan/slice/phase markers, or doc-section references in code comments.
  The check is mechanical and judgment-free, and the references rot — the
  tracker migrates, the plan is deleted, the section is renumbered, and
  the comment becomes a lie. TODO/FIXME comments in delivered code join
  this bucket for the same reason: equally mechanical to detect, and
  hard-banned by the canonical standard — deferred work belongs in the
  implementer's report, not the code.
- **Style escalation:** comments restating WHAT the code does,
  wordy/narrating comments, and commented-out code follow the same regime
  as the test-quality style flags — `suggestion:` for a single occurrence,
  `issue:` when repeated across the diff. A single what-comment never
  blocks a round on its own.
- **Not violations:** upstream-bug links where the link IS the why (a
  workaround pointing at a public issue URL); ticket-like tokens outside
  comment syntax — string literals, log messages, test fixture data (the
  check reads comments only); doc comments on exported/public interfaces
  per the ecosystem's convention. A diff with zero comments passes
  trivially — never manufacture a finding.

### UX Reviewer

- **APPROVE:** API/UX is intuitive, consistent with existing patterns.
- **REQUEST CHANGES:** Usability issues found. Treated as a *major* — auto-fixed
  in the loop, not surfaced to the user.
- **COMMENT:** Minor ergonomic suggestions (minor-and-below — may be surfaced).

### Technical Writer

- **PASS:** Documentation is adequate for the changes made.
- **GAPS:** Documentation gaps identified. Recorded for future work.

## Code Reviewer Inspection Process

1. **Read the diff.** Run `git diff HEAD~1` (or the appropriate range) to see
   what changed. If the scope is unclear, check `git log --oneline -10` first.

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
     `skills/test-first-development/SKILL.md`. Style flags escalate: a
     single occurrence is a `suggestion:`; multiple occurrences across the
     diff become `issue:`. Flaky-test red flags are blocking `issue:`
     findings on **first** occurrence.

5. **Run tests.** Execute the project's test suite to verify tests pass. Report
   the command used and the result.

## Security Review

The security reviewer's step-by-step process — attack-surface
identification, the OWASP Top 10 checks, the additional vulnerability
checks — and the CRITICAL/HIGH/MEDIUM/LOW severity classification ladder
live in `skills/reviewing-security/SKILL.md`. The PASS/FAIL verdict rule
stays here (Verdict Criteria, "Security Reviewer" above): any CRITICAL or
HIGH finding is FAIL, no override.
