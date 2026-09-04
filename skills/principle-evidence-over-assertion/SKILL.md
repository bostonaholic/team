---
name: principle-evidence-over-assertion
description: 'Requires evidence for claims and verdicts. Apply when reporting completion, review findings, or verification results.'
user-invocable: false
---

# Evidence Over Assertion

Give every verdict cited evidence from a command run, file:line read, or authoritative value re-queried; degrade unverifiable verdicts explicitly.

- Verify by re-querying, never by memory; zero exit proves acceptance, not resulting state, so re-read the authority.
- Allow No PASS without cited evidence; report unverifiable items at degraded confidence.
- Ground verdicts in named facts you observed; verify third-party claims at concrete file:line before adopting them.
- Treat reviewer or model agreement as corroboration, never proof or a substitute for your check.
- Verify a dependency claim by resolving it, never by reading a version range or a changelog; load the lowest version the range admits and call the API there, because that boundary is where a removed constant or a missing symbol actually breaks.
