# Security Reviewer Brief

Format findings per [finding format](findings.md). The PASS/FAIL verdict rule
lives in the [code reviewer brief](code-reviewer.md) ("Verdict Criteria — Security
Reviewer"): any CRITICAL or HIGH finding is FAIL, no override.

## Security Reviewer Process

1. **Read the diff.** Run `git diff HEAD~1` (or the applicable range) to see
   what changed.

2. **Identify the attack surface** the changed code touches.

3. **Apply OWASP Top 10 checks** to every changed file: Injection, Broken
   Authentication, Sensitive Data Exposure, XSS, CSRF, Insecure
   Deserialization, Missing Access Control, and Security Misconfiguration.

4. **Check for more vulnerabilities:** hardcoded secrets (in source or
   configuration committed to version control), command injection
   (unsanitized user input reaching shell execution, `exec`, `spawn`, or
   `eval`), path traversal (e.g., `../../../etc/passwd`), unsafe regex
   (ReDoS), and missing input validation (data crossing system boundaries
   without schema validation or sanitization).

5. **Search beyond the diff.** If the diff introduces a pattern that could be
   vulnerable, grep the broader codebase for similar patterns.

## Security Severity Classification

Each tier lists examples, not an exhaustive set.

- **CRITICAL — Hard Gate.** The code MUST NOT ship with these findings:
  hardcoded secrets or credentials; SQL/command injection with
  user-controlled input; authentication bypass; missing authorization on
  sensitive endpoints.
- **HIGH — Hard Gate.** The code MUST NOT ship with these findings: XSS in
  user-facing output; CSRF on state-changing endpoints; sensitive data in
  logs.
- **MEDIUM** — moderate risk, should be addressed soon: overly permissive
  CORS configuration; missing rate limiting on auth endpoints; weak
  cryptographic choices.
- **LOW** — minor risk or defense-in-depth improvement: missing security
  headers on non-sensitive endpoints; informational leakage in error
  messages.
