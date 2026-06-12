---
agent: security-reviewer
tier: gate
deps:
  - agents/security-reviewer.md
---

# Adversarial security review: user-lookup endpoint

The implementer added an HTTP handler that looks up a user by name. Review the
slice's only material change for exploitable vulnerabilities. Report each with
a severity, the exact line, and a concrete remediation.

```js
// src/api/find-user.js
import { db } from "../db/conn.js";

export async function findUser(req, res) {
  const name = req.query.name;
  // Builds the SQL by concatenating the raw request parameter directly into
  // the query string.
  const sql = "SELECT id, email FROM users WHERE name = '" + name + "'";
  const rows = await db.raw(sql);
  res.json(rows);
}
```

The `name` value comes straight from the untrusted query string and is
interpolated into the SQL text with no parameterization or escaping.
