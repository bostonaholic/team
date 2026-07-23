---
name: code-review
description: Generator-evaluator separation and review methodology — loaded by review agents to enforce fresh-context review discipline, Conventional Comments format, and gate verdicts
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

All review comments use the Conventional Comments format
(https://conventionalcomments.org). Every comment MUST include a specific
`file:line` reference.

### Comment Style

Critique the code, not the coder. Assume competence. The same finding can
read as collaborative or hostile depending on phrasing:

| Avoid (person-directed) | Prefer (code-directed) |
|-------------------------|------------------------|
| "Your approach is adding unnecessary complexity." | "The complexity this adds isn't worth the result." |
| "You're not handling the null case." | "The null case isn't handled here." |
| "This doesn't make any sense." | "I can't follow what this branch is doing — clarify?" |

- Explain *why* the change is requested. A finding without a reason loses
  the rationale for the next reader of the diff.
- Reserve `issue:` for findings that materially affect correctness,
  security, or maintainability. Use `suggestion:` or `nitpick:` for
  preferences.
- A high comment density on a single change is a design signal, not just a
  style problem. When the count climbs past ~10 substantive comments,
  propose splitting the change or escalating the design conversation out
  of the review tool.

### Comment Types

Every comment body MUST begin with the label and decoration wrapped in
`**...**` so GitHub renders it bold. Copy the format in the examples below
literally — including the asterisks — into the comment body you emit.

**issue (blocking):**
Identifies a defect that must be fixed before approval.
```
**issue (blocking):** This query interpolates user input without parameterization.
file: src/api/users.ts:42
```

**suggestion (non-blocking):**
Proposes an improvement. The author may accept or decline.
```
**suggestion (non-blocking):** Consider extracting this validation into a shared utility.
file: src/handlers/create.ts:18
```

**nitpick (non-blocking):**
Minor style or naming observation. Never blocks approval.
```
**nitpick (non-blocking):** "data" is too vague — consider "userProfile" to match the domain.
file: src/models/types.ts:7
```

## Gate Types by Reviewer

| Reviewer | Gate Type | Blocks Ship? |
|----------|-----------|--------------|
| `security-reviewer` | HARD | Yes — critical or high findings are non-negotiable |
| `verifier` | HARD | Yes — tests must pass, build must succeed |
| `code-reviewer` | HARD | Yes — blocking issues must be resolved |
| `ux-reviewer` | AUTO-FIX | REQUEST CHANGES is auto-applied in the loop (a *major*); only COMMENT notes may reach you |
| `technical-writer` | ADVISORY | No — findings recorded, pipeline proceeds |

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

## Severity Tiers and the Auto-Fix Boundary

There is no single "blocker/critical/major/minor" scale — reviewers raise
findings in three different vocabularies (Conventional Comments
`issue`/`suggestion`/`nitpick`, security CRITICAL/HIGH/MEDIUM/LOW, and the
APPROVE/REQUEST CHANGES/COMMENT verdict). This table is the authoritative map
from any of those onto the action the orchestrator takes. Every finding lands
in exactly one tier.

| Tier | Findings in this tier | Action |
|------|-----------------------|--------|
| **Blocking** | `issue (blocking)`, code-reviewer REQUEST CHANGES, security CRITICAL/HIGH, any verifier failure | Auto-fixed in the loop. **Never** surfaced to the user. |
| **Major** | `suggestion (non-blocking)`, security MEDIUM, ux-reviewer REQUEST CHANGES | Auto-fixed in the loop. **Never** surfaced to the user. |
| **Minor and below** | `nitpick (non-blocking)`, security LOW, technical-writer GAPS, any COMMENT-level note | Surfaced to the user for a decision — but **only after** Blocking and Major are clean. |

**The consult guard (non-negotiable).** While *any* Blocking or Major finding
remains unresolved, the orchestrator MUST NOT present findings to the user or
ask which ones to address. It loops the implementer automatically. The user is
consulted exclusively for the remaining Minor-and-below findings, and only once the loop
has driven Blocking and Major to zero. A consult prompt that lists a blocking
or major finding is a defect.

## Aggregating Verdicts

When multiple reviewers produce verdicts, aggregate them into a single
pipeline gate decision:

1. If ANY Blocking or Major finding exists -> pipeline gate FAILS — loop back
   to IMPLEMENT automatically, with no consult.
2. If only Minor-and-below findings remain -> pipeline gate is CONDITIONAL:
   present them to the user, who decides. If none remain, proceed to
   SHIP.
3. If no findings remain -> pipeline gate PASSES (proceed to SHIP).

The loop continues until Blocking and Major are zero, capped at 5 rounds; at
the cap, escalate with the full unresolved-findings summary.

Blocking and Major failures are never aggregated away and never surfaced for
triage. A single CRITICAL security finding blocks shipping regardless of how
many other reviewers approved.

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

## Security Reviewer Process

1. **Read the diff.** Run `git diff HEAD~1` (or the appropriate range) to see
   what changed.

2. **Identify the attack surface.** Determine what the changed code touches:
   user input, authentication, authorization, data storage, external services,
   file system, command execution, serialization, or network communication.

3. **Apply OWASP Top 10 checks** to every changed file:
   - **Injection** — SQL, NoSQL, OS command, LDAP. Is user input interpolated
     into queries or commands without parameterization?
   - **Broken Authentication** — Weak password handling, missing rate limiting,
     session fixation, credential exposure in logs.
   - **Sensitive Data Exposure** — Secrets in code, PII in logs, missing
     encryption, overly broad API responses.
   - **XSS** — User input rendered without escaping in HTML, JavaScript, or
     template contexts.
   - **CSRF** — State-changing operations without token validation.
   - **Insecure Deserialization** — Untrusted data passed to deserializers
     without validation.
   - **Missing Access Control** — Authorization checks absent or bypassable,
     IDOR vulnerabilities, privilege escalation paths.
   - **Security Misconfiguration** — Debug mode in production, overly
     permissive CORS, missing security headers, default credentials.

4. **Check for additional vulnerabilities:**
   - **Hardcoded secrets** — API keys, passwords, tokens, connection strings
     in source code or configuration committed to version control.
   - **Command injection** — User input passed to shell execution, `exec`,
     `spawn`, or `eval` without sanitization.
   - **Path traversal** — User-controlled input used in file paths without
     validation (e.g., `../../../etc/passwd`).
   - **Unsafe regex** — Regular expressions vulnerable to ReDoS (catastrophic
     backtracking with user-controlled input).
   - **Missing input validation** — Data crossing system boundaries (HTTP
     requests, file uploads, environment variables) without schema validation
     or sanitization.

5. **Search beyond the diff.** If the diff introduces a pattern that could be
   vulnerable, grep the broader codebase for similar patterns.

## Security Severity Classification

### CRITICAL — Hard Gate

The code MUST NOT ship with these findings. Examples:
- Hardcoded secrets or credentials
- SQL/command injection with user-controlled input
- Authentication bypass
- Missing authorization on sensitive endpoints

### HIGH — Hard Gate

The code MUST NOT ship with these findings. Examples:
- XSS in user-facing output
- CSRF on state-changing endpoints
- Sensitive data in logs

### MEDIUM

Moderate risk, should be addressed soon. Examples:
- Overly permissive CORS configuration
- Missing rate limiting on auth endpoints
- Weak cryptographic choices

### LOW

Minor risk or defense-in-depth improvement. Examples:
- Missing security headers on non-sensitive endpoints
- Informational leakage in error messages
