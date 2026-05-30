---
agent: security-reviewer
tier: gate
deps:
  - agents/security-reviewer.md
---

# Adversarial security review: user-lookup endpoint (parameterized)

The implementer added an HTTP handler that looks up a user by name. Review the
slice's only material change for exploitable vulnerabilities. Report only
*real* vulnerabilities with a severity, the exact line, and a remediation. Do
not flag safe code.

```js
// src/api/find-user.js
import { db } from "../db/conn.js";

export async function findUser(req, res) {
  const name = req.query.name;
  // Uses a parameterized query: the driver binds `name` as a value, never as
  // SQL text. This is the safe pattern and is NOT an injection.
  const rows = await db.raw("SELECT id, email FROM users WHERE name = ?", [name]);
  res.json(rows);
}
```

The `name` value is passed as a bound parameter, so there is no SQL injection
here even though the query references untrusted input.
