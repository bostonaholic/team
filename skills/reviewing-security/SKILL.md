---
name: reviewing-security
description: Security review methodology — attack-surface identification, OWASP Top 10 checks, additional vulnerability checks, and the CRITICAL/HIGH/MEDIUM/LOW severity classification ladder. Load when reviewing a diff for security vulnerabilities, auditing code for injection/XSS/secrets, or classifying a security finding's severity.
user-invocable: false
---

# Reviewing Security

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
