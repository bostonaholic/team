---
name: reviewing-security
description: Review changed trust boundaries and code for security vulnerabilities, with Team severity tiers.
user-invocable: false
---

# Reviewing Security

## Input

Read the applicable diff and identify changed trust boundaries: user input,
authentication, authorization, storage, external services, filesystem,
commands, serialization, and network access.

## Required review

Check every changed file for OWASP risks: injection, broken authentication,
sensitive-data exposure, XSS, CSRF, insecure deserialization, missing access
control, and security misconfiguration. Also check hardcoded secrets, command
injection, path traversal, ReDoS, and missing boundary validation. Search the
codebase for sibling instances of any vulnerable pattern.

## Security Severity Classification

### CRITICAL — Hard Gate

Hardcoded credentials, exploitable SQL/command injection, authentication
bypass, or missing authorization on sensitive operations. MUST NOT ship.

### HIGH — Hard Gate

XSS, CSRF on state changes, or sensitive data in logs. MUST NOT ship.

### MEDIUM

Moderate risk such as permissive CORS, missing auth rate limits, or weak crypto.

### LOW

Defense-in-depth gaps such as missing non-sensitive headers or minor error
disclosure.

## Done

Every reachable attack surface is checked; findings cite code and severity.
