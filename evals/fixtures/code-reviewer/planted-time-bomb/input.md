---
agent: code-reviewer
tier: periodic
deps:
  - agents/code-reviewer.md
  - skills/code-review/SKILL.md
  - skills/conventional-comments/SKILL.md
---

# Synthetic implementer artifact: session-token expiry check

The implementer added a small helper that decides whether a session token
is still valid, plus its tests. The code below is the slice's only
material change.

```js
// src/auth/session.js
export function isSessionValid(session, at) {
  return new Date(session.expiresAt).getTime() > at.getTime();
}
```

```js
// test/auth/session.test.js
import { isSessionValid } from "../../src/auth/session.js";

test("accepts a session that has not expired", () => {
  const session = { expiresAt: "2030-01-01T00:00:00Z" };
  expect(isSessionValid(session, new Date())).toBe(true);
});

test("rejects a session that expired before the check", () => {
  const checkedAt = new Date("2024-06-15T12:00:00Z");
  const session = { expiresAt: "2024-06-14T12:00:00Z" };
  expect(isSessionValid(session, checkedAt)).toBe(false);
});
```

The implementer notes: "Both tests pass locally and in CI."
